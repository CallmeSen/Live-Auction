from __future__ import annotations

import base64
import hashlib
import json
import re
import time
from decimal import Decimal
from functools import lru_cache
from typing import Any

import boto3
from aws_lambda_powertools import Logger, Metrics
from aws_lambda_powertools.event_handler import APIGatewayRestResolver, Response
from aws_lambda_powertools.event_handler.exceptions import (
    NotFoundError as ResolverNotFoundError,
)
from aws_lambda_powertools.metrics import MetricUnit
from botocore.exceptions import ClientError
from pydantic import ValidationError

from auction_common.catalog import (
    item_key,
    load_item_by_id,
    rules_key,
    serialize_item,
    serialize_values,
    session_key,
    transaction_client,
)
from auction_common.config import get_config
from auction_common.http import (
    BadRequest,
    Conflict,
    Forbidden,
    NotFound,
    RequestIdentity,
    ServiceError,
    identity_from_event,
    json_response,
    require_group,
)
from auction_common.models import ControlPlaneRules, ScheduleSessionRequest


app = APIGatewayRestResolver()
logger = Logger(service="admin-command")
metrics = Metrics(namespace="LiveAuction")

_SAFE_SEGMENT = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,127}\Z")
_TERMINAL_ITEM_STATUSES = frozenset(
    {"PENDING_ADMIN_APPROVAL", "SOLD", "UNSOLD", "CANCELLED"}
)
_CLOSED_ITEM_STATUSES = frozenset({"PENDING_ADMIN_APPROVAL", "UNSOLD"})
_MAX_ITEM_QUERY_PAGES = 100
_MAX_VERSION = 2_147_483_647
_MAX_EPOCH = 253_402_300_799
_MAX_REMAINING_SECONDS = 446_400


@lru_cache(maxsize=1)
def _dynamodb_dependencies():
    session = boto3.session.Session()
    return session.resource("dynamodb"), session.client("dynamodb")


def _configured_table(name):
    resource, client = _dynamodb_dependencies()
    table = resource.Table(name)
    table._transaction_client = client
    return table


@lru_cache(maxsize=1)
def _catalog_table():
    return _configured_table(get_config().T_CATALOG)


@lru_cache(maxsize=1)
def _state_table():
    return _configured_table(get_config().T_STATE)


@lru_cache(maxsize=1)
def _events_table():
    return _configured_table(get_config().T_EVENTS)


@lru_cache(maxsize=1)
def _scheduler_client():
    return boto3.client("scheduler")


def _response(
    status_code: int,
    code: str,
    message: str,
    data: Any = None,
) -> Response:
    proxy_response = json_response(status_code, code, message, data)
    return Response(
        status_code=status_code,
        content_type="application/json",
        headers=proxy_response["headers"],
        body=proxy_response["body"],
    )


def _client_error_code(error: ClientError) -> str | None:
    return error.response.get("Error", {}).get("Code")


def _is_conditional_failure(error: ClientError) -> bool:
    if _client_error_code(error) == "ConditionalCheckFailedException":
        return True
    if _client_error_code(error) != "TransactionCanceledException":
        return False
    reasons = error.response.get("CancellationReasons")
    if not isinstance(reasons, list):
        return False
    saw_conditional = False
    for reason in reasons:
        if not isinstance(reason, dict):
            return False
        code = reason.get("Code")
        if code == "ConditionalCheckFailed":
            saw_conditional = True
        elif code not in (None, "None"):
            return False
    return saw_conditional


def _path_segment(value: Any, kind: str) -> str:
    if not isinstance(value, str) or _SAFE_SEGMENT.fullmatch(value) is None:
        raise BadRequest(f"INVALID_{kind.upper()}_ID", f"{kind.title()} identifier is invalid")
    return value


def _epoch(value: Any, field: str) -> int:
    if type(value) is not int or value <= 0:
        raise BadRequest("INVALID_COMMAND", f"{field} is invalid")
    return value


def _persisted_int(
    value: Any,
    field: str,
    *,
    minimum: int,
    maximum: int,
) -> int:
    if type(value) is int:
        normalized = value
    elif isinstance(value, Decimal) and value.is_finite() and value == value.to_integral_value():
        normalized = int(value)
    else:
        raise Conflict(
            "PERSISTED_VALUE_INVALID",
            f"Persisted {field} is invalid",
        )
    if normalized < minimum or normalized > maximum:
        raise Conflict(
            "PERSISTED_VALUE_INVALID",
            f"Persisted {field} is invalid",
        )
    return normalized


def _start_schedule_name(session_id: str) -> str:
    return f"start-session-{session_id}"


def _close_schedule_name(item_id: str, expected_end_epoch: int) -> str:
    return f"close-item-{item_id}-{expected_end_epoch}"


def _schedule_expression(at_epoch: int) -> str:
    return time.strftime("at(%Y-%m-%dT%H:%M:%S)", time.gmtime(at_epoch))


def _schedule_target(payload: dict[str, Any], config) -> dict[str, Any]:
    return {
        "Arn": config.ADMIN_COMMAND_ARN,
        "RoleArn": config.SCHEDULER_ROLE_ARN,
        "Input": json.dumps(payload, separators=(",", ":")),
        "DeadLetterConfig": {"Arn": config.SCHEDULER_DLQ_ARN},
        "RetryPolicy": {
            "MaximumEventAgeInSeconds": 3600,
            "MaximumRetryAttempts": 3,
        },
    }


def _schedule_create_request(
    name: str,
    at_epoch: int,
    payload: dict[str, Any],
    config,
) -> dict[str, Any]:
    return {
        "Name": name,
        "GroupName": config.SCHEDULER_GROUP,
        "ScheduleExpression": _schedule_expression(at_epoch),
        "ScheduleExpressionTimezone": "UTC",
        "State": "ENABLED",
        "FlexibleTimeWindow": {"Mode": "OFF"},
        "Target": _schedule_target(payload, config),
        "ActionAfterCompletion": "DELETE",
    }


def _scheduler_client_token(request: dict[str, Any]) -> str:
    canonical = json.dumps(
        _canonical_request_value(request),
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return f"sch-{hashlib.sha256(canonical).hexdigest()[:32]}"


def _schedule_execution_matches(
    existing: dict[str, Any],
    desired: dict[str, Any],
) -> bool:
    fields = (
        "ScheduleExpression",
        "ScheduleExpressionTimezone",
        "State",
        "FlexibleTimeWindow",
        "ActionAfterCompletion",
        "Target",
    )
    return all(existing.get(field) == desired[field] for field in fields)


def _put_schedule(
    name: str,
    at_epoch: int,
    payload: dict[str, Any],
    *,
    scheduler=None,
    config=None,
) -> None:
    effective_scheduler = scheduler or _scheduler_client()
    effective_config = config or get_config()
    desired = _schedule_create_request(name, at_epoch, payload, effective_config)
    create_request = {
        **desired,
        "ClientToken": _scheduler_client_token(desired),
    }
    try:
        effective_scheduler.create_schedule(**create_request)
        return
    except Exception as create_error:
        try:
            existing = effective_scheduler.get_schedule(
                Name=name,
                GroupName=effective_config.SCHEDULER_GROUP,
            )
        except ClientError as lookup_error:
            if _client_error_code(lookup_error) == "ResourceNotFoundException":
                raise create_error
            raise Conflict(
                "SCHEDULE_RECONCILIATION_REQUIRED",
                "Schedule state needs repair",
            ) from lookup_error
        except Exception as lookup_error:
            raise Conflict(
                "SCHEDULE_RECONCILIATION_REQUIRED",
                "Schedule state needs repair",
            ) from lookup_error
        if _schedule_execution_matches(existing, desired):
            return
        raise Conflict(
            "SCHEDULE_NAME_CONFLICT",
            "Schedule name is already in use",
        ) from create_error


def _delete_schedule(name: str, scheduler, config) -> None:
    try:
        scheduler.delete_schedule(Name=name, GroupName=config.SCHEDULER_GROUP)
    except ClientError as error:
        if _client_error_code(error) != "ResourceNotFoundException":
            raise


def _transaction_token(
    command: str,
    session_id: str,
    item_id: str,
    version: int,
) -> str:
    source = f"{command}:{session_id}:{item_id}:{version}".encode()
    return f"{command[:4]}-{hashlib.sha256(source).hexdigest()[:31]}"


def _canonical_request_value(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: _canonical_request_value(value[key])
            for key in sorted(value)
        }
    if isinstance(value, list):
        return [_canonical_request_value(item) for item in value]
    if isinstance(value, (bytes, bytearray)):
        return {"__bytes__": base64.b64encode(bytes(value)).decode("ascii")}
    return value


def _dynamo_client_token(transact_items: list[dict[str, Any]]) -> str:
    canonical = json.dumps(
        _canonical_request_value(transact_items),
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return f"dtx-{hashlib.sha256(canonical).hexdigest()[:32]}"


def _query_session_items(catalog, session_id: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    start_key = None
    for _page in range(_MAX_ITEM_QUERY_PAGES):
        request: dict[str, Any] = {
            "KeyConditionExpression": "pk = :pk AND begins_with(sk, :prefix)",
            "ExpressionAttributeValues": {
                ":pk": f"SESSION#{session_id}",
                ":prefix": "ITEM#",
            },
            "ConsistentRead": True,
        }
        if start_key is not None:
            request["ExclusiveStartKey"] = start_key
        response = catalog.query(**request)
        items.extend(
            item
            for item in response.get("Items", [])
            if item.get("entity_type") == "ITEM"
            and item.get("session_id") == session_id
        )
        start_key = response.get("LastEvaluatedKey")
        if start_key is None:
            break
    else:
        raise RuntimeError("Session item query exceeded page limit")
    return sorted(
        items,
        key=lambda item: _persisted_int(
            item.get("sequence_number"),
            "item sequence",
            minimum=1,
            maximum=999_999,
        ),
    )


def _next_waiting_item(
    items: list[dict[str, Any]],
    *,
    exclude_item_id: str | None = None,
) -> dict[str, Any] | None:
    waiting = [
        item
        for item in items
        if item.get("status") == "WAITING"
        and item.get("item_id") != exclude_item_id
    ]
    if not waiting:
        return None
    return min(
        waiting,
        key=lambda item: _persisted_int(
            item.get("sequence_number"),
            "item sequence",
            minimum=1,
            maximum=999_999,
        ),
    )


def _validate_schedule(
    identity: RequestIdentity,
    session: dict[str, Any] | None,
    rules: dict[str, Any] | None,
    items: list[dict[str, Any]],
    start_time: int,
    *,
    now: int,
) -> None:
    if "SELLER" not in identity.groups:
        raise Forbidden()
    if session is None:
        raise NotFound("SESSION_NOT_FOUND", "Session was not found")
    if session.get("seller_sub") != identity.sub:
        raise Forbidden()
    if session.get("status") != "DRAFT":
        raise Conflict("SESSION_NOT_DRAFT", "Session is not in draft status")
    if rules is None:
        raise BadRequest("RULES_REQUIRED", "Session rules are required")
    if not items:
        raise BadRequest("ITEM_REQUIRED", "At least one item is required")
    if type(start_time) is not int or start_time <= now:
        raise BadRequest("START_TIME_INVALID", "Start time must be in the future")


def _schedule_session(
    identity: RequestIdentity,
    session_id: str,
    start_time: int,
    catalog,
    scheduler,
    config,
    *,
    now: int,
) -> dict[str, Any]:
    normalized_session_id = _path_segment(session_id, "session")
    session = catalog.get_item(
        Key=session_key(normalized_session_id), ConsistentRead=True
    ).get("Item")
    rules = catalog.get_item(
        Key=rules_key(normalized_session_id), ConsistentRead=True
    ).get("Item")
    items = _query_session_items(catalog, normalized_session_id)
    _validate_schedule(identity, session, rules, items, start_time, now=now)
    version = _persisted_int(
        session.get("version"),
        "session version",
        minimum=1,
        maximum=_MAX_VERSION,
    )
    scheduled_version = version + 1
    try:
        catalog.update_item(
            Key=session_key(normalized_session_id),
            UpdateExpression=(
                "SET #status = :scheduled, start_time = :start_time, "
                "gsi2sk = :gsi2sk, version = :scheduled_version, "
                "updated_at = :now"
            ),
            ConditionExpression="#status = :draft AND version = :expected",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={
                ":scheduled": "SCHEDULED",
                ":start_time": start_time,
                ":gsi2sk": (
                    f"STATUS#SCHEDULED#START#{start_time:010d}#"
                    f"{normalized_session_id}"
                ),
                ":scheduled_version": scheduled_version,
                ":now": now,
                ":draft": "DRAFT",
                ":expected": version,
            },
        )
    except ClientError as error:
        if _client_error_code(error) == "ConditionalCheckFailedException":
            raise Conflict("SESSION_CHANGED", "Session changed; reload and retry") from error
        raise

    payload = {"command": "START_SESSION", "session_id": normalized_session_id}
    try:
        _put_schedule(
            _start_schedule_name(normalized_session_id),
            start_time,
            payload,
            scheduler=scheduler,
            config=config,
        )
    except Exception as schedule_error:
        if (
            isinstance(schedule_error, Conflict)
            and schedule_error.code == "SCHEDULE_RECONCILIATION_REQUIRED"
        ):
            raise
        try:
            catalog.update_item(
                Key=session_key(normalized_session_id),
                UpdateExpression=(
                    "SET #status = :draft, gsi2sk = :gsi2sk, "
                    "version = :draft_version, updated_at = :now REMOVE start_time"
                ),
                ConditionExpression=(
                    "#status = :scheduled AND version = :scheduled_version "
                    "AND start_time = :start_time"
                ),
                ExpressionAttributeNames={"#status": "status"},
                ExpressionAttributeValues={
                    ":draft": "DRAFT",
                    ":gsi2sk": (
                        f"STATUS#DRAFT#START#0000000000#{normalized_session_id}"
                    ),
                    ":draft_version": version,
                    ":now": now,
                    ":scheduled": "SCHEDULED",
                    ":scheduled_version": scheduled_version,
                    ":start_time": start_time,
                },
            )
        except Exception as rollback_error:
            logger.error(
                "schedule rollback failed",
                extra={"session_id": normalized_session_id},
            )
            raise Conflict(
                "SCHEDULE_RECONCILIATION_REQUIRED",
                "Schedule state needs repair",
            ) from rollback_error
        raise schedule_error

    return {
        "session_id": normalized_session_id,
        "status": "SCHEDULED",
        "start_time": start_time,
    }


def _rules_snapshot(rules: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(rules)
    for field, maximum in (
        ("anti_snipe_window_s", 3600),
        ("anti_snipe_extend_s", 3600),
        ("max_extensions", 100),
        ("public_history_limit", 100),
    ):
        normalized[field] = _persisted_int(
            rules.get(field),
            f"rule {field}",
            minimum=0,
            maximum=maximum,
        )
    model = ControlPlaneRules.model_validate(normalized)
    return model.model_dump()


def _active_state_item(
    item: dict[str, Any],
    session: dict[str, Any],
    rules: dict[str, Any],
    config,
    now: int,
) -> dict[str, Any]:
    return {
        "item_id": item["item_id"],
        "session_id": item["session_id"],
        "status": "LIVE",
        "seller_sub": session["seller_sub"],
        "current_price": item["start_price"],
        "end_time": now
        + _persisted_int(
            item.get("duration_s"),
            "item duration",
            minimum=30,
            maximum=86_400,
        ),
        "owner_region": config.OWNER_REGION,
        "extension_count": 0,
        "version": 1,
        **_rules_snapshot(rules),
    }


def _catalog_status_sort(item: dict[str, Any], status: str) -> str:
    created_at = _persisted_int(
        item.get("created_at"),
        "item creation time",
        minimum=0,
        maximum=_MAX_EPOCH,
    )
    return f"STATUS#{status}#CREATED#{created_at:010d}#{item['item_id']}"


def _lifecycle_event(
    event_type: str,
    item_id: str,
    session_id: str,
    token: str,
    now: int,
    now_ms: int,
    status: str,
    **values: Any,
) -> dict[str, Any]:
    return {
        "item_id": item_id,
        "sk": f"{now_ms}#{event_type}#{token}",
        "event_type": event_type,
        "session_id": session_id,
        "status": status,
        "timestamp": now,
        **values,
    }


def _close_payload(item_id: str, end_time: int) -> dict[str, Any]:
    return {
        "command": "CLOSE_ITEM",
        "item_id": item_id,
        "expected_end_epoch": end_time,
    }


def _ensure_close_schedule(item_id: str, end_time: int, scheduler, config) -> None:
    _put_schedule(
        _close_schedule_name(item_id, end_time),
        end_time,
        _close_payload(item_id, end_time),
        scheduler=scheduler,
        config=config,
    )


def _start_result(session: dict[str, Any]) -> dict[str, Any]:
    if session.get("status") == "LIVE" and session.get("active_item_id"):
        return {
            "status": "ALREADY_STARTED",
            "item_id": session["active_item_id"],
        }
    raise Conflict("SESSION_NOT_SCHEDULED", "Session is not scheduled")


def _valid_version(record: dict[str, Any]) -> bool:
    try:
        _persisted_int(
            record.get("version"),
            "record version",
            minimum=1,
            maximum=_MAX_VERSION,
        )
    except Conflict:
        return False
    return True


def _reconcile_live_start_retry(
    session_id: str,
    session: dict[str, Any],
    catalog,
    state_table,
    scheduler,
    config,
) -> dict[str, Any]:
    active_item_id = session.get("active_item_id")
    if (
        not isinstance(active_item_id, str)
        or _SAFE_SEGMENT.fullmatch(active_item_id) is None
        or not _valid_version(session)
    ):
        raise Conflict(
            "START_STATE_CONFLICT",
            "Started session state is inconsistent",
        )
    state = state_table.get_item(
        Key={"item_id": active_item_id}, ConsistentRead=True
    ).get("Item")
    try:
        item = load_item_by_id(catalog, active_item_id)
    except (BadRequest, NotFound, RuntimeError) as error:
        raise Conflict(
            "START_STATE_CONFLICT",
            "Started session state is inconsistent",
        ) from error
    try:
        current_sequence = _persisted_int(
            session.get("current_sequence"),
            "session sequence",
            minimum=1,
            maximum=999_999,
        )
        end_time = _persisted_int(
            None if state is None else state.get("end_time"),
            "item end time",
            minimum=1,
            maximum=_MAX_EPOCH,
        )
        item_sequence = _persisted_int(
            item.get("sequence_number"),
            "item sequence",
            minimum=1,
            maximum=999_999,
        )
    except Conflict as error:
        raise Conflict(
            "START_STATE_CONFLICT",
            "Started session state is inconsistent",
        ) from error
    if (
        state is None
        or state.get("status") != "LIVE"
        or state.get("item_id") != active_item_id
        or state.get("session_id") != session_id
        or state.get("seller_sub") != session.get("seller_sub")
        or not _valid_version(state)
        or item.get("status") != "LIVE"
        or item.get("session_id") != session_id
        or item.get("seller_sub") != session.get("seller_sub")
        or item_sequence != current_sequence
        or not _valid_version(item)
    ):
        raise Conflict(
            "START_STATE_CONFLICT",
            "Started session state is inconsistent",
        )
    _ensure_close_schedule(active_item_id, end_time, scheduler, config)
    return _start_result(session)


def _reconcile_committed_successor(
    session_id: str,
    session: dict[str, Any],
    catalog,
    state_table,
    scheduler,
    config,
) -> None:
    active_item_id = session.get("active_item_id")
    if (
        session.get("status") != "LIVE"
        or not isinstance(active_item_id, str)
        or _SAFE_SEGMENT.fullmatch(active_item_id) is None
        or not _valid_version(session)
    ):
        raise Conflict(
            "SUCCESSOR_STATE_CONFLICT",
            "Successor state is inconsistent",
        )
    state = state_table.get_item(
        Key={"item_id": active_item_id}, ConsistentRead=True
    ).get("Item")
    try:
        item = load_item_by_id(catalog, active_item_id)
    except (BadRequest, NotFound, RuntimeError) as error:
        raise Conflict(
            "SUCCESSOR_STATE_CONFLICT",
            "Successor state is inconsistent",
        ) from error

    status = None if state is None else state.get("status")
    try:
        end_time = _persisted_int(
            None if state is None else state.get("end_time"),
            "item end time",
            minimum=1,
            maximum=_MAX_EPOCH,
        )
        current_sequence = _persisted_int(
            session.get("current_sequence"),
            "session sequence",
            minimum=1,
            maximum=999_999,
        )
        item_sequence = _persisted_int(
            item.get("sequence_number"),
            "item sequence",
            minimum=1,
            maximum=999_999,
        )
        remaining_seconds = (
            _persisted_int(
                state.get("remaining_seconds"),
                "item remaining time",
                minimum=0,
                maximum=_MAX_REMAINING_SECONDS,
            )
            if status == "PAUSED"
            else None
        )
    except Conflict as error:
        raise Conflict(
            "SUCCESSOR_STATE_CONFLICT",
            "Successor state is inconsistent",
        ) from error
    if (
        state is None
        or status not in {"LIVE", "PAUSED"}
        or item.get("status") != status
        or state.get("item_id") != active_item_id
        or state.get("session_id") != session_id
        or state.get("seller_sub") != session.get("seller_sub")
        or not _valid_version(state)
        or item.get("session_id") != session_id
        or item.get("seller_sub") != session.get("seller_sub")
        or item_sequence != current_sequence
        or not _valid_version(item)
    ):
        raise Conflict(
            "SUCCESSOR_STATE_CONFLICT",
            "Successor state is inconsistent",
        )
    if status == "LIVE":
        _ensure_close_schedule(active_item_id, end_time, scheduler, config)


def _start_session(
    session_id: str,
    catalog,
    state_table,
    events,
    scheduler,
    config,
    *,
    now: int,
    now_ms: int | None = None,
) -> dict[str, Any]:
    normalized_session_id = _path_segment(session_id, "session")
    session = catalog.get_item(
        Key=session_key(normalized_session_id), ConsistentRead=True
    ).get("Item")
    if session is None:
        raise NotFound("SESSION_NOT_FOUND", "Session was not found")
    if session.get("status") == "LIVE":
        return _reconcile_live_start_retry(
            normalized_session_id,
            session,
            catalog,
            state_table,
            scheduler,
            config,
        )
    if session.get("status") != "SCHEDULED":
        raise Conflict("SESSION_NOT_SCHEDULED", "Session is not scheduled")

    rules = catalog.get_item(
        Key=rules_key(normalized_session_id), ConsistentRead=True
    ).get("Item")
    if rules is None:
        raise Conflict("RULES_MISSING", "Session rules are unavailable")
    item = _next_waiting_item(_query_session_items(catalog, normalized_session_id))
    if item is None:
        raise Conflict("ITEM_NOT_WAITING", "No waiting item is available")

    opened_at_ms = now * 1000 if now_ms is None else now_ms
    state = _active_state_item(item, session, rules, config, now)
    session_version = _persisted_int(
        session.get("version"),
        "session version",
        minimum=1,
        maximum=_MAX_VERSION,
    )
    item_version = _persisted_int(
        item.get("version"),
        "item version",
        minimum=1,
        maximum=_MAX_VERSION,
    )
    item_sequence = _persisted_int(
        item.get("sequence_number"),
        "item sequence",
        minimum=1,
        maximum=999_999,
    )
    start_time = _persisted_int(
        session.get("start_time"),
        "session start time",
        minimum=1,
        maximum=_MAX_EPOCH,
    )
    token = _transaction_token(
        "open", normalized_session_id, item["item_id"], session_version
    )
    transaction = [
        {
            "Update": {
                "TableName": catalog.name,
                "Key": serialize_item(session_key(normalized_session_id)),
                "UpdateExpression": (
                    "SET #status = :live, active_item_id = :item_id, "
                    "current_sequence = :sequence, version = version + :one, "
                    "gsi2sk = :gsi2sk, updated_at = :now"
                ),
                "ConditionExpression": (
                    "#status = :scheduled AND version = :session_version"
                ),
                "ExpressionAttributeNames": {"#status": "status"},
                "ExpressionAttributeValues": serialize_values(
                    {
                        ":live": "LIVE",
                        ":item_id": item["item_id"],
                        ":sequence": item_sequence,
                        ":one": 1,
                        ":gsi2sk": (
                            f"STATUS#LIVE#START#{start_time:010d}#"
                            f"{normalized_session_id}"
                        ),
                        ":now": now,
                        ":scheduled": "SCHEDULED",
                        ":session_version": session_version,
                    }
                ),
            }
        },
        {
            "Update": {
                "TableName": catalog.name,
                "Key": serialize_item(
                    item_key(
                        normalized_session_id,
                        item_sequence,
                        item["item_id"],
                    )
                ),
                "UpdateExpression": (
                    "SET #status = :live, version = version + :one, "
                    "gsi2sk = :gsi2sk, updated_at = :now"
                ),
                "ConditionExpression": (
                    "#status = :waiting AND version = :item_version"
                ),
                "ExpressionAttributeNames": {"#status": "status"},
                "ExpressionAttributeValues": serialize_values(
                    {
                        ":live": "LIVE",
                        ":one": 1,
                        ":gsi2sk": _catalog_status_sort(item, "LIVE"),
                        ":now": now,
                        ":waiting": "WAITING",
                        ":item_version": item_version,
                    }
                ),
            }
        },
        {
            "Put": {
                "TableName": state_table.name,
                "Item": serialize_item(state),
                "ConditionExpression": "attribute_not_exists(item_id)",
            }
        },
        {
            "Put": {
                "TableName": events.name,
                "Item": serialize_item(
                    _lifecycle_event(
                        "ITEM_OPENED",
                        item["item_id"],
                        normalized_session_id,
                        token,
                        now,
                        opened_at_ms,
                        "LIVE",
                    )
                ),
                "ConditionExpression": (
                    "attribute_not_exists(item_id) AND attribute_not_exists(sk)"
                ),
            }
        },
    ]
    try:
        transaction_client(catalog).transact_write_items(
            TransactItems=transaction,
            ClientRequestToken=_dynamo_client_token(transaction),
        )
    except ClientError as error:
        if not _is_conditional_failure(error):
            raise
        committed = catalog.get_item(
            Key=session_key(normalized_session_id), ConsistentRead=True
        ).get("Item")
        if (
            committed is None
            or committed.get("status") != "LIVE"
            or committed.get("active_item_id") != item["item_id"]
        ):
            raise Conflict("SESSION_CHANGED", "Session changed; reload and retry") from error
        return _reconcile_live_start_retry(
            normalized_session_id,
            committed,
            catalog,
            state_table,
            scheduler,
            config,
        )

    _ensure_close_schedule(
        item["item_id"],
        _persisted_int(
            state.get("end_time"),
            "item end time",
            minimum=1,
            maximum=_MAX_EPOCH,
        ),
        scheduler,
        config,
    )
    return {"status": "STARTED", "item_id": item["item_id"]}


def _terminal_status(state: dict[str, Any]) -> str:
    return (
        "PENDING_ADMIN_APPROVAL"
        if state.get("highest_bidder_id")
        else "UNSOLD"
    )


def _close_decision(
    state: dict[str, Any],
    expected_end_epoch: int,
    *,
    now: int,
    force: bool = False,
) -> dict[str, Any] | None:
    status = state.get("status")
    if status in _TERMINAL_ITEM_STATUSES:
        return {"status": "ALREADY_CLOSED", "terminal_status": status}
    end_time = _persisted_int(
        state.get("end_time"),
        "item end time",
        minimum=1,
        maximum=_MAX_EPOCH,
    )
    if not force and status == "LIVE" and end_time > expected_end_epoch:
        return {"status": "RESCHEDULED", "end_time": end_time}
    if force:
        if status not in {"LIVE", "PAUSED"}:
            raise Conflict("INVALID_ITEM_TRANSITION", "Item transition is not allowed")
        return None
    if status != "LIVE":
        raise Conflict("ITEM_NOT_LIVE", "Item is not live")
    if end_time > now:
        raise Conflict("ITEM_NOT_DUE", "Item is not due to close")
    return None


def _after_close(next_item: dict[str, Any] | None) -> dict[str, Any]:
    return {
        "session_status": "LIVE" if next_item is not None else "COMPLETED",
        "next_item_id": next_item.get("item_id") if next_item is not None else None,
    }


def _read_item_and_state(item_id: str, catalog, state_table):
    item = load_item_by_id(catalog, _path_segment(item_id, "item"))
    state = state_table.get_item(
        Key={"item_id": item_id}, ConsistentRead=True
    ).get("Item")
    if state is None:
        raise Conflict("ITEM_STATE_MISSING", "Item state is unavailable")
    return item, state


def _session_and_rules(catalog, session_id: str):
    session = catalog.get_item(
        Key=session_key(session_id), ConsistentRead=True
    ).get("Item")
    if session is None:
        raise NotFound("SESSION_NOT_FOUND", "Session was not found")
    rules = catalog.get_item(
        Key=rules_key(session_id), ConsistentRead=True
    ).get("Item")
    if rules is None:
        raise Conflict("RULES_MISSING", "Session rules are unavailable")
    return session, rules


def _next_item_operations(
    next_item: dict[str, Any],
    session: dict[str, Any],
    rules: dict[str, Any],
    catalog,
    state_table,
    events,
    config,
    now: int,
    now_ms: int | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    next_state = _active_state_item(next_item, session, rules, config, now)
    opened_at_ms = now * 1000 if now_ms is None else now_ms
    next_sequence = _persisted_int(
        next_item.get("sequence_number"),
        "item sequence",
        minimum=1,
        maximum=999_999,
    )
    next_version = _persisted_int(
        next_item.get("version"),
        "item version",
        minimum=1,
        maximum=_MAX_VERSION,
    )
    session_version = _persisted_int(
        session.get("version"),
        "session version",
        minimum=1,
        maximum=_MAX_VERSION,
    )
    token = _transaction_token(
        "open",
        next_item["session_id"],
        next_item["item_id"],
        session_version,
    )
    operations = [
        {
            "Update": {
                "TableName": catalog.name,
                "Key": serialize_item(
                    item_key(
                        next_item["session_id"],
                        next_sequence,
                        next_item["item_id"],
                    )
                ),
                "UpdateExpression": (
                    "SET #status = :live, version = version + :one, "
                    "gsi2sk = :gsi2sk, updated_at = :now"
                ),
                "ConditionExpression": (
                    "#status = :waiting AND version = :item_version"
                ),
                "ExpressionAttributeNames": {"#status": "status"},
                "ExpressionAttributeValues": serialize_values(
                    {
                        ":live": "LIVE",
                        ":one": 1,
                        ":gsi2sk": _catalog_status_sort(next_item, "LIVE"),
                        ":now": now,
                        ":waiting": "WAITING",
                        ":item_version": next_version,
                    }
                ),
            }
        },
        {
            "Put": {
                "TableName": state_table.name,
                "Item": serialize_item(next_state),
                "ConditionExpression": "attribute_not_exists(item_id)",
            }
        },
        {
            "Put": {
                "TableName": events.name,
                "Item": serialize_item(
                    _lifecycle_event(
                        "ITEM_OPENED",
                        next_item["item_id"],
                        next_item["session_id"],
                        token,
                        now,
                        opened_at_ms,
                        "LIVE",
                    )
                ),
                "ConditionExpression": (
                    "attribute_not_exists(item_id) AND attribute_not_exists(sk)"
                ),
            }
        },
    ]
    return operations, next_state


def _session_after_item_operation(
    session: dict[str, Any],
    next_item: dict[str, Any] | None,
    catalog,
    now: int,
    *,
    current_item_id: str | None = None,
) -> dict[str, Any]:
    session_id = session["session_id"]
    session_version = _persisted_int(
        session.get("version"),
        "session version",
        minimum=1,
        maximum=_MAX_VERSION,
    )
    start_time = _persisted_int(
        session.get("start_time"),
        "session start time",
        minimum=1,
        maximum=_MAX_EPOCH,
    )
    common = {
        ":one": 1,
        ":now": now,
        ":version": session_version,
    }
    condition = "version = :version"
    if current_item_id is not None:
        condition = (
            "#status = :session_live AND active_item_id = :current_item_id "
            "AND version = :version"
        )
        common[":session_live"] = "LIVE"
        common[":current_item_id"] = current_item_id
    if next_item is None:
        return {
            "Update": {
                "TableName": catalog.name,
                "Key": serialize_item(session_key(session_id)),
                "UpdateExpression": (
                    "SET #status = :completed, version = version + :one, "
                    "gsi2sk = :gsi2sk, updated_at = :now "
                    "REMOVE active_item_id, current_sequence"
                ),
                "ConditionExpression": condition,
                "ExpressionAttributeNames": {"#status": "status"},
                "ExpressionAttributeValues": serialize_values(
                    {
                        **common,
                        ":completed": "COMPLETED",
                        ":gsi2sk": (
                            f"STATUS#COMPLETED#START#"
                            f"{start_time:010d}#{session_id}"
                        ),
                    }
                ),
            }
        }
    return {
        "Update": {
            "TableName": catalog.name,
            "Key": serialize_item(session_key(session_id)),
            "UpdateExpression": (
                "SET #status = :live, active_item_id = :item_id, "
                "current_sequence = :sequence, version = version + :one, "
                "gsi2sk = :gsi2sk, updated_at = :now"
            ),
            "ConditionExpression": condition,
            "ExpressionAttributeNames": {"#status": "status"},
            "ExpressionAttributeValues": serialize_values(
                {
                    **common,
                    ":live": "LIVE",
                    ":item_id": next_item["item_id"],
                    ":sequence": _persisted_int(
                        next_item.get("sequence_number"),
                        "item sequence",
                        minimum=1,
                        maximum=999_999,
                    ),
                    ":gsi2sk": (
                        f"STATUS#LIVE#START#"
                        f"{start_time:010d}#{session_id}"
                    ),
                }
            ),
        }
    }


def _close_item(
    item_id: str,
    expected_end_epoch: int,
    catalog,
    state_table,
    events,
    scheduler,
    config,
    *,
    now: int,
    now_ms: int | None = None,
    force: bool = False,
) -> dict[str, Any]:
    normalized_item_id = _path_segment(item_id, "item")
    expected_end = _epoch(expected_end_epoch, "expected_end_epoch")
    item, state = _read_item_and_state(normalized_item_id, catalog, state_table)
    session = catalog.get_item(
        Key=session_key(item["session_id"]), ConsistentRead=True
    ).get("Item")
    if session is None:
        raise NotFound("SESSION_NOT_FOUND", "Session was not found")
    decision = _close_decision(state, expected_end, now=now, force=force)
    if decision is not None:
        if decision["status"] == "RESCHEDULED":
            _ensure_close_schedule(
                normalized_item_id, decision["end_time"], scheduler, config
            )
        elif (
            session.get("status") == "LIVE"
            and session.get("active_item_id")
            and session.get("active_item_id") != normalized_item_id
        ):
            _reconcile_committed_successor(
                item["session_id"],
                session,
                catalog,
                state_table,
                scheduler,
                config,
            )
        return decision

    session_id = item["session_id"]
    rules = catalog.get_item(
        Key=rules_key(session_id), ConsistentRead=True
    ).get("Item")
    if rules is None:
        raise Conflict("RULES_MISSING", "Session rules are unavailable")
    next_item = _next_waiting_item(
        _query_session_items(catalog, session_id), exclude_item_id=normalized_item_id
    )
    terminal = _terminal_status(state)
    state_version = _persisted_int(
        state.get("version"),
        "item state version",
        minimum=1,
        maximum=_MAX_VERSION,
    )
    item_version = _persisted_int(
        item.get("version"),
        "item version",
        minimum=1,
        maximum=_MAX_VERSION,
    )
    item_sequence = _persisted_int(
        item.get("sequence_number"),
        "item sequence",
        minimum=1,
        maximum=999_999,
    )
    token = _transaction_token("close", session_id, normalized_item_id, state_version)
    closed_at_ms = now * 1000 if now_ms is None else now_ms
    winner_sub = state.get("highest_bidder_id") or ""
    final_price = state["current_price"]
    state_condition = (
        "#status IN (:live, :paused) AND version = :state_version"
        if force
        else (
            "#status = :live AND end_time <= :now "
            "AND version = :state_version"
        )
    )
    state_values = {
        ":terminal": terminal,
        ":final_price": final_price,
        ":winner_sub": winner_sub,
        ":one": 1,
        ":live": "LIVE",
        ":state_version": state_version,
    }
    if force:
        state_values[":paused"] = "PAUSED"
    else:
        state_values[":now"] = now
    transaction: list[dict[str, Any]] = [
        {
            "Update": {
                "TableName": state_table.name,
                "Key": serialize_item({"item_id": normalized_item_id}),
                "UpdateExpression": (
                    "SET #status = :terminal, final_price = :final_price, "
                    "winner_sub = :winner_sub, version = version + :one"
                ),
                "ConditionExpression": state_condition,
                "ExpressionAttributeNames": {"#status": "status"},
                "ExpressionAttributeValues": serialize_values(state_values),
            }
        },
        {
            "Update": {
                "TableName": catalog.name,
                "Key": serialize_item(
                    item_key(session_id, item_sequence, normalized_item_id)
                ),
                "UpdateExpression": (
                    "SET #status = :terminal, final_price = :final_price, "
                    "winner_sub = :winner_sub, version = version + :one, "
                    "gsi2sk = :gsi2sk, updated_at = :now"
                ),
                "ConditionExpression": (
                    "#status = :catalog_status AND version = :item_version"
                ),
                "ExpressionAttributeNames": {"#status": "status"},
                "ExpressionAttributeValues": serialize_values(
                    {
                        ":terminal": terminal,
                        ":final_price": final_price,
                        ":winner_sub": winner_sub,
                        ":one": 1,
                        ":gsi2sk": _catalog_status_sort(item, terminal),
                        ":now": now,
                        ":catalog_status": item["status"],
                        ":item_version": item_version,
                    }
                ),
            }
        },
        {
            "Put": {
                "TableName": events.name,
                "Item": serialize_item(
                    _lifecycle_event(
                        "ITEM_CLOSED",
                        normalized_item_id,
                        session_id,
                        token,
                        now,
                        closed_at_ms,
                        terminal,
                        final_price=final_price,
                        winner_sub=winner_sub,
                    )
                ),
                "ConditionExpression": (
                    "attribute_not_exists(item_id) AND attribute_not_exists(sk)"
                ),
            }
        },
        _session_after_item_operation(
            session,
            next_item,
            catalog,
            now,
            current_item_id=normalized_item_id,
        ),
    ]
    next_state = None
    if next_item is not None:
        next_operations, next_state = _next_item_operations(
            next_item,
            session,
            rules,
            catalog,
            state_table,
            events,
            config,
            now,
            closed_at_ms,
        )
        transaction.extend(next_operations)
    try:
        transaction_client(catalog).transact_write_items(
            TransactItems=transaction,
            ClientRequestToken=_dynamo_client_token(transaction),
        )
    except ClientError as error:
        if not _is_conditional_failure(error):
            raise
        committed = state_table.get_item(
            Key={"item_id": normalized_item_id}, ConsistentRead=True
        ).get("Item")
        if committed is None or committed.get("status") not in _TERMINAL_ITEM_STATUSES:
            raise Conflict("ITEM_CHANGED", "Item changed; reload and retry") from error
        committed_item = load_item_by_id(catalog, normalized_item_id)
        if committed_item.get("status") != committed.get("status"):
            raise Conflict("ITEM_CHANGED", "Item changed; reload and retry") from error
        committed_session = catalog.get_item(
            Key=session_key(session_id), ConsistentRead=True
        ).get("Item")
        if committed_session is None:
            raise Conflict("ITEM_CHANGED", "Item changed; reload and retry") from error
        if (
            committed_session.get("status") == "LIVE"
            and committed_session.get("active_item_id") != normalized_item_id
        ):
            _reconcile_committed_successor(
                session_id,
                committed_session,
                catalog,
                state_table,
                scheduler,
                config,
            )
        elif committed_session.get("status") != "COMPLETED":
            raise Conflict("ITEM_CHANGED", "Item changed; reload and retry") from error
        return {
            "status": "ALREADY_CLOSED",
            "terminal_status": committed["status"],
        }

    if next_item is not None and next_state is not None:
        _ensure_close_schedule(
            next_item["item_id"],
            _persisted_int(
                next_state.get("end_time"),
                "item end time",
                minimum=1,
                maximum=_MAX_EPOCH,
            ),
            scheduler,
            config,
        )
    after = _after_close(next_item)
    return {
        "status": "CLOSED",
        "terminal_status": terminal,
        "next_item_id": after["next_item_id"],
        "session_status": after["session_status"],
    }


def _require_operator(identity: RequestIdentity, _command: str) -> None:
    if "ADMIN" not in identity.groups:
        raise Forbidden()


def _operator_transition(command: str, status: str) -> str:
    transitions = {
        "pause": {"LIVE": "PAUSED"},
        "resume": {"PAUSED": "LIVE"},
        "approve": {"PENDING_ADMIN_APPROVAL": "SOLD"},
        "close": {"LIVE": "CLOSED", "PAUSED": "CLOSED"},
        "cancel": {
            "WAITING": "CANCELLED",
            "LIVE": "CANCELLED",
            "PAUSED": "CANCELLED",
        },
    }
    target = transitions.get(command, {}).get(status)
    if target is None:
        raise Conflict("INVALID_ITEM_TRANSITION", "Item transition is not allowed")
    return target


def _operator_event(
    event_type: str,
    item: dict[str, Any],
    token: str,
    now: int,
    now_ms: int,
    status: str,
    actor_sub: str,
) -> dict[str, Any]:
    return {
        "Put": {
            "TableName": "",
            "Item": serialize_item(
                _lifecycle_event(
                    event_type,
                    item["item_id"],
                    item["session_id"],
                    token,
                    now,
                    now_ms,
                    status,
                    actor_sub=actor_sub,
                )
            ),
            "ConditionExpression": (
                "attribute_not_exists(item_id) AND attribute_not_exists(sk)"
            ),
        }
    }


def _two_record_operator_transaction(
    identity: RequestIdentity,
    command: str,
    event_type: str,
    target_status: str,
    item: dict[str, Any],
    state: dict[str, Any],
    catalog,
    state_table,
    events,
    now: int,
    now_ms: int,
    state_set: dict[str, Any],
    catalog_set: dict[str, Any] | None = None,
) -> tuple[str, list[dict[str, Any]]]:
    state_version = _persisted_int(
        state.get("version"),
        "item state version",
        minimum=1,
        maximum=_MAX_VERSION,
    )
    item_version = _persisted_int(
        item.get("version"),
        "item version",
        minimum=1,
        maximum=_MAX_VERSION,
    )
    item_sequence = _persisted_int(
        item.get("sequence_number"),
        "item sequence",
        minimum=1,
        maximum=999_999,
    )
    token = _transaction_token(
        command, item["session_id"], item["item_id"], state_version
    )
    effective_state_set = dict(state_set)
    state_assignments_extra = effective_state_set.pop("__assignments__", [])
    state_values = {
        ":target": target_status,
        ":one": 1,
        ":source": state["status"],
        ":version": state_version,
        **effective_state_set,
    }
    state_assignments = ["#status = :target", "version = version + :one"]
    state_assignments.extend(
        f"{name} = {placeholder}"
        for name, placeholder in state_assignments_extra
    )
    effective_catalog_set = dict(catalog_set or {})
    catalog_assignments_extra = effective_catalog_set.pop("__assignments__", [])
    catalog_values = {
        ":target": target_status,
        ":one": 1,
        ":now": now,
        ":gsi2sk": _catalog_status_sort(item, target_status),
        ":source": item["status"],
        ":version": item_version,
        **effective_catalog_set,
    }
    catalog_assignments = [
        "#status = :target",
        "version = version + :one",
        "updated_at = :now",
        "gsi2sk = :gsi2sk",
    ]
    catalog_assignments.extend(
        f"{name} = {placeholder}"
        for name, placeholder in catalog_assignments_extra
    )
    event_operation = _operator_event(
        event_type,
        item,
        token,
        now,
        now_ms,
        target_status,
        identity.sub,
    )
    event_operation["Put"]["TableName"] = events.name
    return token, [
        {
            "Update": {
                "TableName": state_table.name,
                "Key": serialize_item({"item_id": item["item_id"]}),
                "UpdateExpression": "SET " + ", ".join(state_assignments),
                "ConditionExpression": "#status = :source AND version = :version",
                "ExpressionAttributeNames": {"#status": "status"},
                "ExpressionAttributeValues": serialize_values(state_values),
            }
        },
        {
            "Update": {
                "TableName": catalog.name,
                "Key": serialize_item(
                    item_key(item["session_id"], item_sequence, item["item_id"])
                ),
                "UpdateExpression": "SET " + ", ".join(catalog_assignments),
                "ConditionExpression": "#status = :source AND version = :version",
                "ExpressionAttributeNames": {"#status": "status"},
                "ExpressionAttributeValues": serialize_values(catalog_values),
            }
        },
        event_operation,
    ]


def _pause_item(
    identity,
    item_id,
    catalog,
    state_table,
    events,
    scheduler,
    config,
    *,
    now,
    now_ms=None,
):
    _require_operator(identity, "pause")
    item, state = _read_item_and_state(item_id, catalog, state_table)
    end_time = _persisted_int(
        state.get("end_time"),
        "item end time",
        minimum=1,
        maximum=_MAX_EPOCH,
    )
    if state.get("status") == "PAUSED":
        remaining = _persisted_int(
            state.get("remaining_seconds"),
            "item remaining time",
            minimum=0,
            maximum=_MAX_REMAINING_SECONDS,
        )
        _delete_schedule(_close_schedule_name(item_id, end_time), scheduler, config)
        return {
            "status": "ALREADY_PAUSED",
            "item_id": item_id,
            "remaining_seconds": remaining,
        }
    _operator_transition("pause", state.get("status"))
    remaining = max(0, end_time - now)
    effective_ms = now * 1000 if now_ms is None else now_ms
    state_set = {
        ":remaining": remaining,
        "__assignments__": [("remaining_seconds", ":remaining")],
    }
    token, transaction = _two_record_operator_transaction(
        identity, "pause", "ITEM_PAUSED", "PAUSED", item, state,
        catalog, state_table, events, now, effective_ms, state_set,
    )
    try:
        transaction_client(catalog).transact_write_items(
            TransactItems=transaction,
            ClientRequestToken=_dynamo_client_token(transaction),
        )
    except ClientError as error:
        if not _is_conditional_failure(error):
            raise
        committed = state_table.get_item(Key={"item_id": item_id}, ConsistentRead=True).get("Item")
        if committed is None or committed.get("status") != "PAUSED":
            raise Conflict("ITEM_CHANGED", "Item changed; reload and retry") from error
        remaining = _persisted_int(
            committed.get("remaining_seconds"),
            "item remaining time",
            minimum=0,
            maximum=_MAX_REMAINING_SECONDS,
        )
    _delete_schedule(_close_schedule_name(item_id, end_time), scheduler, config)
    return {"status": "PAUSED", "item_id": item_id, "remaining_seconds": remaining}


def _resume_item(
    identity,
    item_id,
    catalog,
    state_table,
    events,
    scheduler,
    config,
    *,
    now,
    now_ms=None,
):
    _require_operator(identity, "resume")
    item, state = _read_item_and_state(item_id, catalog, state_table)
    if state.get("status") == "LIVE" and "remaining_seconds" in state:
        end_time = _persisted_int(
            state.get("end_time"),
            "item end time",
            minimum=1,
            maximum=_MAX_EPOCH,
        )
        _ensure_close_schedule(item_id, end_time, scheduler, config)
        return {"status": "ALREADY_RESUMED", "item_id": item_id, "end_time": end_time}
    _operator_transition("resume", state.get("status"))
    remaining = _persisted_int(
        state.get("remaining_seconds"),
        "item remaining time",
        minimum=0,
        maximum=_MAX_REMAINING_SECONDS,
    )
    end_time = now + remaining
    effective_ms = now * 1000 if now_ms is None else now_ms
    state_set = {
        ":end_time": end_time,
        "__assignments__": [("end_time", ":end_time")],
    }
    token, transaction = _two_record_operator_transaction(
        identity, "resume", "ITEM_RESUMED", "LIVE", item, state,
        catalog, state_table, events, now, effective_ms, state_set,
    )
    try:
        transaction_client(catalog).transact_write_items(
            TransactItems=transaction,
            ClientRequestToken=_dynamo_client_token(transaction),
        )
    except ClientError as error:
        if not _is_conditional_failure(error):
            raise
        committed = state_table.get_item(Key={"item_id": item_id}, ConsistentRead=True).get("Item")
        if committed is None or committed.get("status") != "LIVE":
            raise Conflict("ITEM_CHANGED", "Item changed; reload and retry") from error
        end_time = _persisted_int(
            committed.get("end_time"),
            "item end time",
            minimum=1,
            maximum=_MAX_EPOCH,
        )
    _ensure_close_schedule(item_id, end_time, scheduler, config)
    return {"status": "LIVE", "item_id": item_id, "end_time": end_time}


def _committed_close_result(
    item: dict[str, Any],
    state: dict[str, Any],
) -> tuple[str, Decimal]:
    winner_sub = state.get("winner_sub")
    final_price = state.get("final_price")
    if (
        not isinstance(winner_sub, str)
        or not winner_sub
        or not isinstance(final_price, Decimal)
        or final_price < 0
        or item.get("winner_sub") != winner_sub
        or item.get("final_price") != final_price
    ):
        raise Conflict(
            "CLOSE_RESULT_CONFLICT",
            "Committed close result is inconsistent",
        )
    return winner_sub, final_price


def _approve_item(
    identity,
    item_id,
    catalog,
    state_table,
    events,
    config,
    *,
    now,
    now_ms=None,
):
    del config
    _require_operator(identity, "approve")
    item, state = _read_item_and_state(item_id, catalog, state_table)
    winner_sub, final_price = _committed_close_result(item, state)
    if state.get("status") == "SOLD":
        return {
            "status": "ALREADY_APPROVED",
            "item_id": item_id,
            "winner_sub": winner_sub,
            "final_price": final_price,
        }
    _operator_transition("approve", state.get("status"))
    effective_ms = now * 1000 if now_ms is None else now_ms
    assignments = [
        ("winner_sub", ":winner_sub"),
        ("final_price", ":final_price"),
    ]
    values = {
        ":winner_sub": winner_sub,
        ":final_price": final_price,
        "__assignments__": assignments,
    }
    token, transaction = _two_record_operator_transaction(
        identity, "approve", "ITEM_APPROVED", "SOLD", item, state,
        catalog, state_table, events, now, effective_ms, values, dict(values),
    )
    try:
        transaction_client(catalog).transact_write_items(
            TransactItems=transaction,
            ClientRequestToken=_dynamo_client_token(transaction),
        )
    except ClientError as error:
        if not _is_conditional_failure(error):
            raise
        committed = state_table.get_item(Key={"item_id": item_id}, ConsistentRead=True).get("Item")
        if committed is None or committed.get("status") != "SOLD":
            raise Conflict("ITEM_CHANGED", "Item changed; reload and retry") from error
    return {
        "status": "SOLD",
        "item_id": item_id,
        "winner_sub": winner_sub,
        "final_price": final_price,
    }


def _operator_close_item(
    identity,
    item_id,
    catalog,
    state_table,
    events,
    scheduler,
    config,
    *,
    now,
):
    _require_operator(identity, "close")
    state = state_table.get_item(Key={"item_id": item_id}, ConsistentRead=True).get("Item")
    if state is None:
        raise Conflict("ITEM_STATE_MISSING", "Item state is unavailable")
    end_time = _persisted_int(
        state.get("end_time"),
        "item end time",
        minimum=1,
        maximum=_MAX_EPOCH,
    )
    if state.get("status") in _CLOSED_ITEM_STATUSES:
        return _close_item(
            item_id,
            end_time,
            catalog,
            state_table,
            events,
            scheduler,
            config,
            now=now,
            force=True,
        )
    _operator_transition("close", state.get("status"))
    return _close_item(
        item_id,
        end_time,
        catalog,
        state_table,
        events,
        scheduler,
        config,
        now=now,
        force=True,
    )


def _reconcile_cancelled_item(
    item: dict[str, Any],
    catalog,
    state_table,
    scheduler,
    config,
) -> dict[str, Any]:
    item_id = item["item_id"]
    session_id = item["session_id"]
    state = state_table.get_item(
        Key={"item_id": item_id}, ConsistentRead=True
    ).get("Item")
    if state is not None:
        try:
            end_time = _persisted_int(
                state.get("end_time"),
                "item end time",
                minimum=1,
                maximum=_MAX_EPOCH,
            )
        except Conflict as error:
            raise Conflict(
                "CANCEL_STATE_CONFLICT",
                "Cancelled item state is inconsistent",
            ) from error
        if (
            state.get("status") != "CANCELLED"
            or state.get("item_id") != item_id
            or state.get("session_id") != session_id
            or not _valid_version(state)
        ):
            raise Conflict(
                "CANCEL_STATE_CONFLICT",
                "Cancelled item state is inconsistent",
            )
        _delete_schedule(
            _close_schedule_name(item_id, end_time), scheduler, config
        )

    session = catalog.get_item(
        Key=session_key(session_id), ConsistentRead=True
    ).get("Item")
    if session is None:
        raise Conflict(
            "CANCEL_STATE_CONFLICT",
            "Cancelled item state is inconsistent",
        )
    if session.get("status") == "LIVE":
        if session.get("active_item_id") == item_id:
            raise Conflict(
                "CANCEL_STATE_CONFLICT",
                "Cancelled item state is inconsistent",
            )
        _reconcile_committed_successor(
            session_id,
            session,
            catalog,
            state_table,
            scheduler,
            config,
        )
    elif session.get("status") not in {"DRAFT", "SCHEDULED", "COMPLETED"}:
        raise Conflict(
            "CANCEL_STATE_CONFLICT",
            "Cancelled item state is inconsistent",
        )
    return {"status": "ALREADY_CANCELLED", "item_id": item_id}


def _cancel_item(
    identity,
    item_id,
    catalog,
    state_table,
    events,
    scheduler,
    config,
    *,
    now,
    now_ms=None,
):
    _require_operator(identity, "cancel")
    normalized_item_id = _path_segment(item_id, "item")
    item = load_item_by_id(catalog, normalized_item_id)
    if item.get("status") == "CANCELLED":
        return _reconcile_cancelled_item(
            item,
            catalog,
            state_table,
            scheduler,
            config,
        )
    _operator_transition("cancel", item.get("status"))
    state = state_table.get_item(
        Key={"item_id": normalized_item_id}, ConsistentRead=True
    ).get("Item")
    if item.get("status") in {"LIVE", "PAUSED"} and state is None:
        raise Conflict("ITEM_STATE_MISSING", "Item state is unavailable")
    session = catalog.get_item(
        Key=session_key(item["session_id"]), ConsistentRead=True
    ).get("Item")
    if session is None:
        raise NotFound("SESSION_NOT_FOUND", "Session was not found")
    state_version = (
        _persisted_int(
            state.get("version"),
            "item state version",
            minimum=1,
            maximum=_MAX_VERSION,
        )
        if state is not None
        else None
    )
    item_version = _persisted_int(
        item.get("version"),
        "item version",
        minimum=1,
        maximum=_MAX_VERSION,
    )
    item_sequence = _persisted_int(
        item.get("sequence_number"),
        "item sequence",
        minimum=1,
        maximum=999_999,
    )
    version_source = state_version if state_version is not None else item_version
    token = _transaction_token("cancel", item["session_id"], normalized_item_id, version_source)
    effective_ms = now * 1000 if now_ms is None else now_ms
    transaction: list[dict[str, Any]] = []
    if state is not None:
        transaction.append(
            {
                "Update": {
                    "TableName": state_table.name,
                    "Key": serialize_item({"item_id": normalized_item_id}),
                    "UpdateExpression": "SET #status = :cancelled, version = version + :one",
                    "ConditionExpression": (
                        "#status IN (:live, :paused) AND version = :version"
                    ),
                    "ExpressionAttributeNames": {"#status": "status"},
                    "ExpressionAttributeValues": serialize_values(
                        {
                            ":cancelled": "CANCELLED",
                            ":one": 1,
                            ":live": "LIVE",
                            ":paused": "PAUSED",
                            ":version": state_version,
                        }
                    ),
                }
            }
        )
    transaction.append(
        {
            "Update": {
                "TableName": catalog.name,
                "Key": serialize_item(
                    item_key(item["session_id"], item_sequence, normalized_item_id)
                ),
                "UpdateExpression": (
                    "SET #status = :cancelled, version = version + :one, "
                    "gsi2sk = :gsi2sk, updated_at = :now"
                ),
                "ConditionExpression": (
                    "#status = :source AND version = :version"
                ),
                "ExpressionAttributeNames": {"#status": "status"},
                "ExpressionAttributeValues": serialize_values(
                    {
                        ":cancelled": "CANCELLED",
                        ":one": 1,
                        ":gsi2sk": _catalog_status_sort(item, "CANCELLED"),
                        ":now": now,
                        ":source": item["status"],
                        ":version": item_version,
                    }
                ),
            }
        }
    )
    event_operation = _operator_event(
        "ITEM_CANCELLED", item, token, now, effective_ms, "CANCELLED", identity.sub
    )
    event_operation["Put"]["TableName"] = events.name
    transaction.append(event_operation)
    if (
        item.get("status") == "WAITING"
        and session.get("active_item_id") != normalized_item_id
    ):
        try:
            transaction_client(catalog).transact_write_items(
                TransactItems=transaction,
                ClientRequestToken=_dynamo_client_token(transaction),
            )
        except ClientError as error:
            if not _is_conditional_failure(error):
                raise
            committed = load_item_by_id(catalog, normalized_item_id)
            if committed.get("status") != "CANCELLED":
                raise Conflict(
                    "ITEM_CHANGED", "Item changed; reload and retry"
                ) from error
            return {
                "status": "ALREADY_CANCELLED",
                "item_id": normalized_item_id,
            }
        return {"status": "CANCELLED", "item_id": normalized_item_id}

    rules = catalog.get_item(
        Key=rules_key(item["session_id"]), ConsistentRead=True
    ).get("Item")
    if rules is None:
        raise Conflict("RULES_MISSING", "Session rules are unavailable")
    next_item = _next_waiting_item(
        _query_session_items(catalog, item["session_id"]),
        exclude_item_id=normalized_item_id,
    )
    transaction.append(
        _session_after_item_operation(
            session,
            next_item,
            catalog,
            now,
            current_item_id=normalized_item_id,
        )
    )
    next_state = None
    if next_item is not None:
        next_operations, next_state = _next_item_operations(
            next_item,
            session,
            rules,
            catalog,
            state_table,
            events,
            config,
            now,
            effective_ms,
        )
        transaction.extend(next_operations)
    try:
        transaction_client(catalog).transact_write_items(
            TransactItems=transaction,
            ClientRequestToken=_dynamo_client_token(transaction),
        )
    except ClientError as error:
        if not _is_conditional_failure(error):
            raise
        committed = load_item_by_id(catalog, normalized_item_id)
        if committed.get("status") != "CANCELLED":
            raise Conflict("ITEM_CHANGED", "Item changed; reload and retry") from error
        return _reconcile_cancelled_item(
            committed,
            catalog,
            state_table,
            scheduler,
            config,
        )
    if state is not None and state.get("status") == "LIVE":
        prior_end_time = _persisted_int(
            state.get("end_time"),
            "item end time",
            minimum=1,
            maximum=_MAX_EPOCH,
        )
        _delete_schedule(
            _close_schedule_name(normalized_item_id, prior_end_time),
            scheduler,
            config,
        )
    if next_item is not None and next_state is not None:
        _ensure_close_schedule(
            next_item["item_id"],
            _persisted_int(
                next_state.get("end_time"),
                "item end time",
                minimum=1,
                maximum=_MAX_EPOCH,
            ),
            scheduler,
            config,
        )
    after = _after_close(next_item)
    return {
        "status": "CANCELLED",
        "item_id": normalized_item_id,
        "next_item_id": after["next_item_id"],
        "session_status": after["session_status"],
    }


def _overdue_states(states: list[dict[str, Any]], *, now: int):
    overdue = []
    for state in states:
        if state.get("status") != "LIVE":
            continue
        end_time = _persisted_int(
            state.get("end_time"),
            "item end time",
            minimum=1,
            maximum=_MAX_EPOCH,
        )
        if end_time <= now:
            overdue.append(state)
    return overdue


def _watchdog_sweep(
    catalog,
    state_table,
    events,
    scheduler,
    config,
    *,
    now: int,
    metric_sink=metrics,
) -> dict[str, Any]:
    response = catalog.query(
        IndexName="gsi2",
        KeyConditionExpression="gsi2pk = :pk AND begins_with(gsi2sk, :prefix)",
        ExpressionAttributeValues={":pk": "ITEM", ":prefix": "STATUS#LIVE#"},
        Limit=100,
    )
    states = []
    for item in response.get("Items", []):
        item_id = item.get("item_id")
        if not isinstance(item_id, str):
            continue
        state = state_table.get_item(
            Key={"item_id": item_id}, ConsistentRead=True
        ).get("Item")
        if state is not None:
            states.append(state)
    closed = 0
    for state in _overdue_states(states, now=now):
        end_time = _persisted_int(
            state.get("end_time"),
            "item end time",
            minimum=1,
            maximum=_MAX_EPOCH,
        )
        _close_item(
            state["item_id"],
            end_time,
            catalog,
            state_table,
            events,
            scheduler,
            config,
            now=now,
            force=False,
        )
        closed += 1
    more_work = bool(response.get("LastEvaluatedKey"))
    if more_work:
        metric_sink.add_metric(
            name="WatchdogMoreWork", unit=MetricUnit.Count, value=1
        )
        logger.warning("watchdog page limit reached", extra={"more_work": True})
    return {"status": "SWEEP_COMPLETE", "closed": closed, "more_work": more_work}


def start_session(session_id: str):
    return _start_session(
        session_id,
        _catalog_table(),
        _state_table(),
        _events_table(),
        _scheduler_client(),
        get_config(),
        now=int(time.time()),
    )


def close_item(item_id: str, expected_end_epoch: int):
    return _close_item(
        item_id,
        expected_end_epoch,
        _catalog_table(),
        _state_table(),
        _events_table(),
        _scheduler_client(),
        get_config(),
        now=int(time.time()),
    )


def watchdog_sweep(now: int | None = None):
    return _watchdog_sweep(
        _catalog_table(),
        _state_table(),
        _events_table(),
        _scheduler_client(),
        get_config(),
        now=int(time.time()) if now is None else now,
    )


def _empty_body() -> None:
    body = app.current_event.json_body
    if body not in (None, {}):
        raise BadRequest("INVALID_REQUEST_BODY", "Request body must be empty")


@app.post("/api/v1/auction-sessions/<session_id>/schedule")
def schedule_session(session_id: str) -> Response:
    identity = identity_from_event(app.current_event.raw_event)
    body = ScheduleSessionRequest.model_validate(app.current_event.json_body)
    normalized_session_id = _path_segment(session_id, "session")
    data = _schedule_session(
        identity,
        normalized_session_id,
        body.start_time,
        _catalog_table(),
        _scheduler_client(),
        get_config(),
        now=int(time.time()),
    )
    return _response(200, "SESSION_SCHEDULED", "Session scheduled", data)


def _operator_dependencies(
    identity: RequestIdentity,
    command: str,
    item_id: str,
):
    _require_operator(identity, command)
    normalized_item_id = _path_segment(item_id, "item")
    _empty_body()
    return (
        normalized_item_id,
        _catalog_table(),
        _state_table(),
        _events_table(),
        _scheduler_client(),
        get_config(),
    )


@app.post("/api/v1/admin/items/<item_id>/pause")
def pause_item_route(item_id: str) -> Response:
    identity = identity_from_event(app.current_event.raw_event)
    item_id, catalog, state, events, scheduler, config = _operator_dependencies(
        identity, "pause", item_id
    )
    data = _pause_item(
        identity,
        item_id,
        catalog,
        state,
        events,
        scheduler,
        config,
        now=int(time.time()),
    )
    return _response(200, "ITEM_PAUSED", "Item paused", data)


@app.post("/api/v1/admin/items/<item_id>/resume")
def resume_item_route(item_id: str) -> Response:
    identity = identity_from_event(app.current_event.raw_event)
    item_id, catalog, state, events, scheduler, config = _operator_dependencies(
        identity, "resume", item_id
    )
    data = _resume_item(
        identity,
        item_id,
        catalog,
        state,
        events,
        scheduler,
        config,
        now=int(time.time()),
    )
    return _response(200, "ITEM_RESUMED", "Item resumed", data)


@app.post("/api/v1/admin/items/<item_id>/approve")
def approve_item_route(item_id: str) -> Response:
    identity = identity_from_event(app.current_event.raw_event)
    item_id, catalog, state, events, _scheduler, config = _operator_dependencies(
        identity, "approve", item_id
    )
    data = _approve_item(
        identity,
        item_id,
        catalog,
        state,
        events,
        config,
        now=int(time.time()),
    )
    return _response(200, "ITEM_APPROVED", "Item approved", data)


@app.post("/api/v1/admin/items/<item_id>/close")
def close_item_route(item_id: str) -> Response:
    identity = identity_from_event(app.current_event.raw_event)
    item_id, catalog, state, events, scheduler, config = _operator_dependencies(
        identity, "close", item_id
    )
    data = _operator_close_item(
        identity,
        item_id,
        catalog,
        state,
        events,
        scheduler,
        config,
        now=int(time.time()),
    )
    return _response(200, "ITEM_CLOSED", "Item closed", data)


@app.post("/api/v1/admin/items/<item_id>/cancel")
def cancel_item_route(item_id: str) -> Response:
    identity = identity_from_event(app.current_event.raw_event)
    item_id, catalog, state, events, scheduler, config = _operator_dependencies(
        identity, "cancel", item_id
    )
    data = _cancel_item(
        identity,
        item_id,
        catalog,
        state,
        events,
        scheduler,
        config,
        now=int(time.time()),
    )
    return _response(200, "ITEM_CANCELLED", "Item cancelled", data)


@app.exception_handler(ServiceError)
def handle_service_error(error: ServiceError) -> Response:
    return _response(error.status_code, error.code, error.message)


@app.exception_handler(ValidationError)
def handle_validation_error(_error: ValidationError) -> Response:
    return _response(400, "VALIDATION_ERROR", "Request validation failed")


@app.exception_handler(json.JSONDecodeError)
def handle_invalid_json(_error: json.JSONDecodeError) -> Response:
    return _response(400, "INVALID_JSON", "Request body must be valid JSON")


@app.exception_handler(ResolverNotFoundError)
def handle_route_not_found(_error: ResolverNotFoundError) -> Response:
    return _response(404, "ROUTE_NOT_FOUND", "Route was not found")


@app.exception_handler(Exception)
def handle_unexpected_error(_error: Exception) -> Response:
    logger.exception("Unhandled admin command error")
    return _response(500, "INTERNAL_ERROR", "Internal server error")


def _direct_command(event: dict[str, Any]):
    command = event.get("command")
    if command == "START_SESSION":
        if frozenset(event) != frozenset({"command", "session_id"}):
            raise BadRequest("INVALID_COMMAND", "Scheduler command is invalid")
        session_id = _path_segment(event.get("session_id"), "session")
        return start_session(session_id)
    if command in {"CLOSE_ITEM", "WATCHDOG_CLOSE"}:
        if frozenset(event) != frozenset(
            {"command", "item_id", "expected_end_epoch"}
        ):
            raise BadRequest("INVALID_COMMAND", "Scheduler command is invalid")
        item_id = _path_segment(event.get("item_id"), "item")
        expected_end = _epoch(event.get("expected_end_epoch"), "expected_end_epoch")
        return close_item(item_id, expected_end)
    if command == "WATCHDOG_SWEEP":
        if frozenset(event) != frozenset({"command"}):
            raise BadRequest("INVALID_COMMAND", "Scheduler command is invalid")
        return watchdog_sweep()
    raise BadRequest("INVALID_COMMAND", "Scheduler command is invalid")


def handler(event, context):
    try:
        if isinstance(event, dict) and "command" in event:
            return _direct_command(event)
        return app.resolve(event, context)
    finally:
        if metrics.metric_set:
            metrics.flush_metrics()
