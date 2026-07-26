from __future__ import annotations

import json
from decimal import Decimal
from functools import lru_cache
from typing import Any, Mapping

import boto3
from aws_lambda_powertools import Logger
from aws_lambda_powertools.utilities.typing import LambdaContext
from botocore.exceptions import BotoCoreError, ClientError

from auction_common.config import get_config
from auction_common.dynamo import table
from auction_common.errors import ACCEPTED


DELIVERED = "DELIVERED"
STALE = "STALE"
FAILED = "FAILED"
MAX_ITEM_ID_LENGTH = 128
_RESULT_STATUSES = frozenset({ACCEPTED, "REJECTED"})
_PAYLOAD_FIELDS = (
    "status",
    "request_id",
    "reason",
    "current_price",
    "highest_bidder_alias",
    "end_time",
    "extension_count",
)

logger = Logger(service="broadcast")


@lru_cache(maxsize=1)
def _room_table():
    return table(get_config().T_CONN)


@lru_cache(maxsize=1)
def _api():
    cfg = get_config()
    return boto3.client(
        "apigatewaymanagementapi",
        endpoint_url=cfg.WS_ENDPOINT,
        region_name=cfg.REGION,
    )


def _json_default(value: Any) -> str:
    if isinstance(value, Decimal):
        return str(value)
    raise TypeError(f"unsupported value: {type(value).__name__}")


def _payload(kind: str, item_id: str, result: Mapping[str, Any]) -> bytes:
    message = {"type": kind, "item_id": item_id}
    message.update(
        {
            field: result[field]
            for field in _PAYLOAD_FIELDS
            if field in result and result[field] is not None
        }
    )
    return json.dumps(
        message,
        default=_json_default,
        separators=(",", ":"),
    ).encode("utf-8")


def _is_stale(error: ClientError) -> bool:
    response = error.response
    code = str(response.get("Error", {}).get("Code", ""))
    status_code = response.get("ResponseMetadata", {}).get("HTTPStatusCode")
    return code in {"GoneException", "410"} or status_code == 410


def _warn_client_error(message: str, error: ClientError) -> None:
    code = str(error.response.get("Error", {}).get("Code", "ClientError"))[:64]
    logger.warning(message, extra={"error_code": code})


def _post(api, connection_id: str, payload: bytes) -> str:
    try:
        api.post_to_connection(ConnectionId=connection_id, Data=payload)
    except ClientError as error:
        if _is_stale(error):
            return STALE
        _warn_client_error("WebSocket delivery failed", error)
        return FAILED
    except BotoCoreError:
        logger.warning("WebSocket delivery failed")
        return FAILED
    return DELIVERED


def _delete_room(
    room_table,
    item_id: str,
    connection_id: str,
    session_revision: Any | None = None,
) -> None:
    condition = "#record_type = :room"
    values = {":room": "ROOM"}
    if session_revision is not None:
        condition += " AND session_revision = :session_revision"
        values[":session_revision"] = session_revision
    try:
        room_table.delete_item(
            Key={"item_id": item_id, "connection_id": connection_id},
            ConditionExpression=condition,
            ExpressionAttributeNames={"#record_type": "record_type"},
            ExpressionAttributeValues=values,
        )
    except ClientError as error:
        if (
            error.response.get("Error", {}).get("Code")
            == "ConditionalCheckFailedException"
        ):
            return
        _warn_client_error("Stale room cleanup failed", error)


def _record_outcome(
    counts: dict[str, int],
    outcome: str,
    item_id: str,
    connection_id: str,
    room_table=None,
    session_revision: Any | None = None,
    cleanup_requires_revision: bool = False,
) -> None:
    if outcome == DELIVERED:
        counts["delivered"] += 1
    elif outcome == STALE:
        counts["stale"] += 1
        if cleanup_requires_revision and (
            not isinstance(session_revision, str)
            or not session_revision.strip()
        ):
            return
        _delete_room(
            room_table if room_table is not None else _room_table(),
            item_id,
            connection_id,
            session_revision,
        )
    else:
        counts["failed"] += 1


def _validate_event(
    event: Mapping[str, Any],
) -> tuple[str, Mapping[str, Any]]:
    if not isinstance(event, Mapping):
        raise ValueError("invalid broadcast event")
    item_id = event.get("item_id")
    result = event.get("result")
    if (
        not isinstance(item_id, str)
        or not item_id.strip()
        or len(item_id) > MAX_ITEM_ID_LENGTH
        or not isinstance(result, Mapping)
    ):
        raise ValueError("invalid broadcast event")
    status = result.get("status")
    if not isinstance(status, str) or status not in _RESULT_STATUSES:
        raise ValueError("invalid broadcast event")
    return item_id, result


def _handle(event: Mapping[str, Any]) -> dict[str, int]:
    item_id, result = _validate_event(event)

    counts = {"delivered": 0, "stale": 0, "failed": 0}
    if result.get("status") != ACCEPTED:
        connection_id = result.get("connection_id")
        if not isinstance(connection_id, str) or not connection_id:
            return counts
        outcome = _post(
            _api(),
            connection_id,
            _payload("bid_result", item_id, result),
        )
        _record_outcome(
            counts,
            outcome,
            item_id,
            connection_id,
        )
        return counts

    room_table = _room_table()
    payload = _payload("price_update", item_id, result)
    query = {
        "KeyConditionExpression": "item_id = :i",
        "ExpressionAttributeValues": {":i": item_id},
    }
    while True:
        response = room_table.query(**query)
        for record in response.get("Items", ()):
            if not isinstance(record, Mapping) or record.get("record_type") != "ROOM":
                continue
            connection_id = record.get("connection_id")
            if not isinstance(connection_id, str) or not connection_id:
                continue
            outcome = _post(_api(), connection_id, payload)
            _record_outcome(
                counts,
                outcome,
                item_id,
                connection_id,
                room_table=room_table,
                session_revision=record.get("session_revision"),
                cleanup_requires_revision=True,
            )

        last_key = response.get("LastEvaluatedKey")
        if not last_key:
            break
        query["ExclusiveStartKey"] = last_key

    return counts


@logger.inject_lambda_context(log_event=False)
def handler(event: Mapping[str, Any], context: LambdaContext) -> dict[str, int]:
    return _handle(event)
