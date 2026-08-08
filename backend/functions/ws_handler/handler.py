from __future__ import annotations

import json
import re
import time
from decimal import Decimal, InvalidOperation
from functools import lru_cache
from typing import Any, Mapping
from uuid import uuid4

import boto3
from aws_lambda_powertools import Logger
from aws_lambda_powertools.utilities.typing import LambdaContext
from botocore.exceptions import ClientError

from auction_common.config import get_config
from auction_common.dynamo import table
from boto3.dynamodb.types import TypeSerializer


AUTH_ITEM_ID = "__connection_auth__"
AUTH_TTL_SECONDS = 2 * 60 * 60
SUPPORTED_ROLES = frozenset({"ADMIN", "USER"})
_IDENTIFIER_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,127}", re.ASCII)
_serializer = TypeSerializer()

logger = Logger(service="ws-handler")


def _valid_identifier(value: Any, minimum_length: int) -> bool:
    return (
        isinstance(value, str)
        and minimum_length <= len(value) <= 128
        and _IDENTIFIER_RE.fullmatch(value) is not None
    )


def _response(status_code: int, message: str) -> dict[str, Any]:
    return {
        "statusCode": status_code,
        "body": json.dumps({"error": message}, separators=(",", ":")),
    }


def _success(status_code: int, payload: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "statusCode": status_code,
        "body": json.dumps(payload, separators=(",", ":"), default=str),
    }


def _request_context(event: Mapping[str, Any]) -> Mapping[str, Any]:
    context = event.get("requestContext")
    return context if isinstance(context, Mapping) else {}


def _connection_id(event: Mapping[str, Any]) -> str | None:
    value = _request_context(event).get("connectionId")
    return value if isinstance(value, str) and value else None


def _authorizer_context(event: Mapping[str, Any]) -> Mapping[str, Any]:
    authorizer = _request_context(event).get("authorizer")
    if not isinstance(authorizer, Mapping):
        return {}
    nested = authorizer.get("lambda")
    if isinstance(nested, Mapping):
        return nested
    return authorizer


def _auth_key(connection_id: str) -> dict[str, str]:
    return {"item_id": AUTH_ITEM_ID, "connection_id": connection_id}


def _room_key(item_id: str, connection_id: str) -> dict[str, str]:
    return {"item_id": item_id, "connection_id": connection_id}


def _ttl() -> int:
    return int(time.time()) + AUTH_TTL_SECONDS


def _auth_item(
    connection_id: str,
    context: Mapping[str, Any],
    ttl: int,
    session_revision: str,
) -> dict[str, Any]:
    return {
        "item_id": AUTH_ITEM_ID,
        "connection_id": connection_id,
        "record_type": "AUTH",
        "user_sub": context["sub"],
        "email": str(context.get("email", "")),
        "role": context["role"],
        "session_revision": session_revision,
        "ttl": ttl,
    }


def _get_auth(connection_id: str) -> dict[str, Any] | None:
    response = table(get_config().T_CONN).get_item(
        Key=_auth_key(connection_id),
        ConsistentRead=True,
    )
    return response.get("Item")


def _put_auth(item: dict[str, Any]) -> None:
    table(get_config().T_CONN).put_item(Item=item)


def _item_is_live(item_id: str) -> bool:
    response = table(get_config().T_STATE).get_item(
        Key={"item_id": item_id},
        ConsistentRead=True,
    )
    return response.get("Item", {}).get("status") == "LIVE"


def _assign_alias(item_id: str, user_sub: str) -> str:
    aliases = table(get_config().T_ALIAS)
    response = aliases.get_item(
        Key={"item_id": item_id, "user_id": user_sub},
        ConsistentRead=True,
    )
    item = response.get("Item")
    if item:
        existing = item.get("bidder_alias") or item.get("alias")
        if isinstance(existing, str) and existing:
            return existing

    counter = aliases.update_item(
        Key={"item_id": item_id, "user_id": "__counter__"},
        UpdateExpression="ADD #seq :one",
        ExpressionAttributeNames={"#seq": "seq"},
        ExpressionAttributeValues={":one": 1},
        ReturnValues="UPDATED_NEW",
    )
    sequence = int(counter["Attributes"]["seq"])
    alias = f"Bidder #{sequence}"
    try:
        aliases.put_item(
            Item={
                "item_id": item_id,
                "user_id": user_sub,
                "bidder_alias": alias,
            },
            ConditionExpression="attribute_not_exists(user_id)",
        )
    except ClientError as error:
        if error.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise
        response = aliases.get_item(
            Key={"item_id": item_id, "user_id": user_sub},
            ConsistentRead=True,
        )
        item = response.get("Item") or {}
        existing = item.get("bidder_alias") or item.get("alias")
        if isinstance(existing, str) and existing:
            return existing
        raise
    return alias


def _serialize(values: Mapping[str, Any]) -> dict[str, Any]:
    return {key: _serializer.serialize(value) for key, value in values.items()}


@lru_cache(maxsize=1)
def _ddb_client():
    return boto3.client("dynamodb", region_name=get_config().REGION)


@lru_cache(maxsize=1)
def _sqs_client():
    return boto3.client("sqs", region_name=get_config().REGION)


@lru_cache(maxsize=4)
def _management_client(endpoint: str):
    return boto3.client(
        "apigatewaymanagementapi",
        endpoint_url=endpoint,
        region_name=get_config().REGION,
    )


def _replace_room(
    *,
    connection_id: str,
    old_item_id: str | None,
    new_item_id: str,
    room: dict[str, Any],
    ttl: int,
    expected_user_sub: str,
    expected_session_revision: str,
) -> None:
    table_name = get_config().T_CONN
    actions: list[dict[str, Any]] = []
    if old_item_id and old_item_id != new_item_id:
        actions.append(
            {
                "Delete": {
                    "TableName": table_name,
                    "Key": _serialize(_room_key(old_item_id, connection_id)),
                }
            }
        )
    actions.extend(
        [
            {
                "Put": {
                    "TableName": table_name,
                    "Item": _serialize(room),
                }
            },
            {
                "Update": {
                    "TableName": table_name,
                    "Key": _serialize(_auth_key(connection_id)),
                    "UpdateExpression": (
                        "SET current_item_id = :item, #ttl = :ttl, "
                        "session_revision = :new_session_revision"
                    ),
                    "ExpressionAttributeNames": {"#ttl": "ttl"},
                    "ConditionExpression": (
                        "attribute_exists(item_id) AND user_sub = :expected_user_sub "
                        "AND session_revision = :expected_session_revision "
                        + (
                            "AND current_item_id = :expected_item"
                            if old_item_id
                            else "AND attribute_not_exists(current_item_id)"
                        )
                    ),
                    "ExpressionAttributeValues": _serialize(
                        {
                            ":item": new_item_id,
                            ":ttl": ttl,
                            ":expected_user_sub": expected_user_sub,
                            ":expected_session_revision": expected_session_revision,
                            ":new_session_revision": room["session_revision"],
                            **(
                                {":expected_item": old_item_id}
                                if old_item_id
                                else {}
                            ),
                        }
                    ),
                }
            },
        ]
    )
    _ddb_client().transact_write_items(TransactItems=actions)


def _delete_connection(
    connection_id: str,
    expected_current_item_id: str | None,
    expected_user_sub: str,
    expected_session_revision: str,
) -> None:
    table_name = get_config().T_CONN
    actions: list[dict[str, Any]] = []
    if expected_current_item_id:
        actions.append(
            {
                "Delete": {
                    "TableName": table_name,
                    "Key": _serialize(
                        _room_key(expected_current_item_id, connection_id)
                    ),
                    "ConditionExpression": (
                        "attribute_not_exists(item_id) OR "
                        "(#record_type = :room AND user_sub = :expected_user_sub "
                        "AND session_revision = :expected_session_revision)"
                    ),
                    "ExpressionAttributeNames": {"#record_type": "record_type"},
                    "ExpressionAttributeValues": _serialize(
                        {
                            ":room": "ROOM",
                            ":expected_user_sub": expected_user_sub,
                            ":expected_session_revision": expected_session_revision,
                        }
                    ),
                }
            }
        )
    actions.append(
        {
            "Delete": {
                "TableName": table_name,
                "Key": _serialize(_auth_key(connection_id)),
                "ConditionExpression": (
                    "attribute_not_exists(item_id) OR "
                    "(record_type = :auth AND user_sub = :expected_user_sub "
                    "AND session_revision = :expected_session_revision "
                    + (
                        "AND current_item_id = :expected_item)"
                        if expected_current_item_id
                        else "AND attribute_not_exists(current_item_id))"
                    )
                ),
                "ExpressionAttributeValues": _serialize(
                    {
                        ":auth": "AUTH",
                        ":expected_user_sub": expected_user_sub,
                        ":expected_session_revision": expected_session_revision,
                        **(
                            {":expected_item": expected_current_item_id}
                            if expected_current_item_id
                            else {}
                        ),
                    }
                ),
            }
        }
    )
    _ddb_client().transact_write_items(TransactItems=actions)


def _json_default(value: Any) -> str:
    if isinstance(value, Decimal):
        return str(value)
    raise TypeError(f"unsupported value: {type(value).__name__}")


def _send_sqs(command: dict[str, Any]) -> None:
    cfg = get_config()
    _sqs_client().send_message(
        QueueUrl=cfg.BID_QUEUE_URL,
        MessageBody=json.dumps(command, default=_json_default, separators=(",", ":")),
        MessageGroupId=command["item_id"],
        MessageDeduplicationId=command["request_id"],
    )


def _management_endpoint(event: Mapping[str, Any]) -> str | None:
    configured = getattr(get_config(), "WS_ENDPOINT", "")
    if configured:
        return str(configured).rstrip("/")
    context = _request_context(event)
    domain = context.get("domainName")
    stage = context.get("stage")
    if not isinstance(domain, str) or not domain:
        return None
    if not isinstance(stage, str) or not stage:
        return f"https://{domain}"
    return f"https://{domain}/{stage}"


def _ack(event: Mapping[str, Any], payload: Mapping[str, Any]) -> None:
    endpoint = _management_endpoint(event)
    connection_id = _connection_id(event)
    if endpoint is None or connection_id is None:
        return
    _management_client(endpoint).post_to_connection(
        ConnectionId=connection_id,
        Data=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
    )


def _parse_body(event: Mapping[str, Any]) -> dict[str, Any] | None:
    body = event.get("body")
    if isinstance(body, Mapping):
        return dict(body)
    if not isinstance(body, str) or not body:
        return None
    try:
        parsed = json.loads(body)
    except (TypeError, ValueError):
        return None
    return parsed if isinstance(parsed, dict) else None


def _connect(event: Mapping[str, Any], connection_id: str | None) -> dict[str, Any]:
    context = _authorizer_context(event)
    sub = context.get("sub")
    role = context.get("role")
    if not isinstance(sub, str) or not sub or not isinstance(role, str) or not role:
        return _response(401, "authorization required")
    if role not in SUPPORTED_ROLES:
        return _response(403, "unsupported role")
    if connection_id is None:
        return _response(400, "connection unavailable")

    _put_auth(_auth_item(connection_id, context, _ttl(), uuid4().hex))
    return _success(200, {"status": "connected"})


def _join_room(
    event: Mapping[str, Any], connection_id: str, auth: Mapping[str, Any]
) -> dict[str, Any]:
    body = _parse_body(event)
    item_id = body.get("item_id") if body else None
    if not _valid_identifier(item_id, 1) or item_id == AUTH_ITEM_ID:
        return _response(400, "invalid item")
    if not _item_is_live(item_id):
        return _response(409, "item is not live")

    user_sub = auth.get("user_sub")
    expected_session_revision = auth.get("session_revision")
    if (
        not isinstance(user_sub, str)
        or not user_sub
        or not isinstance(expected_session_revision, str)
        or not expected_session_revision
    ):
        return _response(401, "authorization required")
    ttl = _ttl()
    alias = _assign_alias(item_id, user_sub)
    session_revision = uuid4().hex
    room = {
        "item_id": item_id,
        "connection_id": connection_id,
        "record_type": "ROOM",
        "user_sub": user_sub,
        "bidder_alias": alias,
        "session_revision": session_revision,
        "ttl": ttl,
    }
    _replace_room(
        connection_id=connection_id,
        old_item_id=auth.get("current_item_id"),
        new_item_id=item_id,
        room=room,
        ttl=ttl,
        expected_user_sub=user_sub,
        expected_session_revision=expected_session_revision,
    )
    payload = {"type": "room_joined", "item_id": item_id, "bidder_alias": alias}
    _ack(event, payload)
    return _success(200, payload)


def _place_bid(
    event: Mapping[str, Any], connection_id: str, auth: Mapping[str, Any]
) -> dict[str, Any]:
    if auth.get("role") != "USER":
        return _response(403, "user role required")
    body = _parse_body(event)
    if body is None:
        return _response(400, "invalid message")

    item_id = body.get("item_id")
    request_id = body.get("request_id")
    if not _valid_identifier(item_id, 1):
        return _response(400, "invalid item")
    if auth.get("current_item_id") != item_id:
        return _response(403, "room membership required")
    if not _valid_identifier(request_id, 8):
        return _response(400, "invalid request")

    try:
        amount = Decimal(str(body.get("amount")))
    except (InvalidOperation, ValueError, TypeError):
        return _response(400, "invalid amount")
    if not amount.is_finite() or amount <= 0:
        return _response(400, "invalid amount")

    user_sub = auth.get("user_sub")
    if not isinstance(user_sub, str) or not user_sub:
        return _response(401, "authorization required")
    command = {
        "item_id": item_id,
        "amount": amount,
        "request_id": request_id,
        "user_sub": user_sub,
        "owner_region": get_config().OWNER_REGION,
        "connection_id": connection_id,
    }
    _send_sqs(command)
    payload = {"type": "bid_queued", "item_id": item_id, "request_id": request_id}
    _ack(event, payload)
    return _success(202, payload)


def _disconnect(connection_id: str, auth: Mapping[str, Any] | None) -> dict[str, Any]:
    if auth is None:
        return _success(200, {"status": "disconnected"})
    try:
        user_sub = auth.get("user_sub")
        session_revision = auth.get("session_revision")
        if (
            not isinstance(user_sub, str)
            or not user_sub
            or not isinstance(session_revision, str)
            or not session_revision
        ):
            raise ValueError("stored auth identity unavailable")
        _delete_connection(
            connection_id,
            auth.get("current_item_id"),
            user_sub,
            session_revision,
        )
    except Exception:
        logger.warning("WebSocket cleanup failed; TTL fallback retained")
    return _success(200, {"status": "disconnected"})


def _handle(event: Mapping[str, Any]) -> dict[str, Any]:
    context = _request_context(event)
    route = context.get("routeKey")
    connection_id = _connection_id(event)
    if route == "$connect":
        return _connect(event, connection_id)
    if connection_id is None:
        return _response(400, "connection unavailable")

    auth = _get_auth(connection_id)
    if route == "$disconnect":
        return _disconnect(connection_id, auth)
    if auth is None:
        return _response(401, "authorization required")
    if route == "joinRoom":
        return _join_room(event, connection_id, auth)
    if route == "placeBid":
        return _place_bid(event, connection_id, auth)
    return _response(400, "unknown route")


@logger.inject_lambda_context(log_event=False)
def handler(event: Mapping[str, Any], context: LambdaContext) -> dict[str, Any]:
    return _handle(event)
