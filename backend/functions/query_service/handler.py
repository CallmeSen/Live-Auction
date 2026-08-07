from __future__ import annotations

import base64
import json
import os
import re
from collections.abc import Mapping
from decimal import Decimal
from functools import lru_cache
from typing import Any

import boto3
from aws_lambda_powertools import Logger
from aws_lambda_powertools.event_handler import APIGatewayRestResolver, CORSConfig, Response
from aws_lambda_powertools.event_handler.exceptions import (
    NotFoundError as ResolverNotFoundError,
)

from auction_common.catalog import (
    decode_cursor,
    encode_cursor,
    load_item_by_id,
    rules_key,
    session_key,
)
from auction_common.config import get_config
from auction_common.http import (
    BadRequest,
    Conflict,
    NotFound,
    RequestIdentity,
    ServiceError,
    identity_from_event,
    json_response,
    request_origin_from_event,
    require_group,
)


def _cors_config() -> CORSConfig:
    raw_origins = os.environ.get("CORS_ALLOWED_ORIGINS", "").strip()
    origins: list[str] = []
    if raw_origins:
        try:
            parsed = json.loads(raw_origins)
        except json.JSONDecodeError:
            parsed = []
        if isinstance(parsed, list):
            origins = [
                origin.strip()
                for origin in parsed
                if isinstance(origin, str)
                and origin.strip()
                and origin.strip() not in {"*", "null"}
            ]
    if not origins:
        fallback = os.environ.get("CORS_ALLOWED_ORIGIN", "").strip()
        if fallback and fallback not in {"*", "null"}:
            origins = [fallback]
    if not origins:
        origins = ["http://localhost:5173"]

    return CORSConfig(allow_origin=origins[0], extra_origins=origins[1:])


app = APIGatewayRestResolver(cors=_cors_config())
app._cors_methods.update({"GET", "POST", "PUT", "PATCH", "OPTIONS"})
logger = Logger(service="query-service")

_SESSION_PRIVATE_STATUS = "DRAFT"
_ITEM_PRIVATE_STATUS = "WAITING"
_SESSION_STATUSES = frozenset(
    {"SCHEDULED", "LIVE", "COMPLETED", "CANCELLED"}
)
_ITEM_STATUSES = frozenset(
    {
        "LIVE",
        "PAUSED",
        "PENDING_ADMIN_APPROVAL",
        "SOLD",
        "UNSOLD",
        "CANCELLED",
    }
)
_SESSION_PUBLIC_FIELDS = (
    "session_id",
    "title",
    "description",
    "status",
    "item_count",
    "start_time",
    "active_item_id",
    "current_sequence",
    "created_at",
    "updated_at",
)
_SESSION_SELLER_FIELDS = _SESSION_PUBLIC_FIELDS + ("seller_sub", "version")
_RULES_PUBLIC_FIELDS = (
    "min_increment",
    "max_increment",
    "anti_snipe_window_s",
    "anti_snipe_extend_s",
    "max_extensions",
    "public_history_limit",
)
_ITEM_PUBLIC_FIELDS = (
    "item_id",
    "session_id",
    "sequence_number",
    "name",
    "description",
    "category_id",
    "start_price",
    "duration_s",
    "status",
    "image_keys",
    "final_price",
    "created_at",
    "updated_at",
)
_LIVE_PUBLIC_FIELDS = (
    "status",
    "current_price",
    "end_time",
    "extension_count",
    "remaining_seconds",
    "final_price",
)
_INTEGER_PUBLIC_FIELDS = frozenset(
    {
        "item_count",
        "start_time",
        "current_sequence",
        "version",
        "created_at",
        "updated_at",
        "anti_snipe_window_s",
        "anti_snipe_extend_s",
        "max_extensions",
        "public_history_limit",
        "sequence_number",
        "duration_s",
        "end_time",
        "extension_count",
        "remaining_seconds",
        "timestamp",
    }
)
_BID_PUBLIC_FIELDS = (
    "item_id",
    "session_id",
    "request_id",
    "amount",
    "status",
    "reason",
    "timestamp",
    "created_at",
)
_GSI1_CURSOR_FIELDS = frozenset({"pk", "sk", "gsi1pk", "gsi1sk"})
_GSI2_CURSOR_FIELDS = frozenset({"pk", "sk", "gsi2pk", "gsi2sk"})
_BID_CURSOR_FIELDS = frozenset({"item_id", "sk", "bidder_sub"})
_BASE_CURSOR_FIELDS = frozenset({"pk", "sk"})
_INVALID_QUERY_MESSAGE = "Query parameters are invalid"
_MAX_SESSION_ITEM_QUERY_PAGES = 100
_MAX_FILTER_QUERY_BATCHES = 10
_CATEGORY_PUBLIC_FIELDS = (
    "category_id",
    "name",
    "slug",
    "status",
    "created_at",
    "updated_at",
)
_MAX_CATEGORY_QUERY_PAGES = 100
_SAFE_SEGMENT = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,127}\Z")


@lru_cache(maxsize=1)
def _catalog_table():
    return boto3.resource("dynamodb").Table(get_config().T_CATALOG)


@lru_cache(maxsize=1)
def _state_table():
    return boto3.resource("dynamodb").Table(get_config().T_STATE)


@lru_cache(maxsize=1)
def _events_table():
    return boto3.resource("dynamodb").Table(get_config().T_EVENTS)


@lru_cache(maxsize=1)
def _category_table():
    return boto3.resource("dynamodb").Table(get_config().T_CATEGORY_CATALOG)


def _response(
    status_code: int,
    code: str,
    message: str,
    data: Any = None,
) -> Response:
    proxy_response = json_response(
        status_code,
        code,
        message,
        data,
        request_origin=request_origin_from_event(
            getattr(getattr(app, "current_event", None), "raw_event", {})
        ),
    )
    return Response(
        status_code=status_code,
        content_type="application/json",
        headers=proxy_response["headers"],
        body=proxy_response["body"],
    )


def _invalid_query() -> BadRequest:
    return BadRequest("INVALID_QUERY", _INVALID_QUERY_MESSAGE)


def _invalid_cursor() -> BadRequest:
    return BadRequest("INVALID_CURSOR", "Cursor is invalid")


def _validate_page_size(page_size: int) -> None:
    if type(page_size) is not int or not 1 <= page_size <= 100:
        raise _invalid_query()


def _validate_status(status: Any, allowed: frozenset[str]) -> None:
    if status is not None and status not in allowed:
        raise _invalid_query()


def _decoded_cursor(
    cursor: str | None,
    fields: frozenset[str],
    context: Mapping[str, str | None],
) -> dict[str, str] | None:
    key = decode_cursor(cursor, context)
    if key is not None and frozenset(key) != fields:
        raise _invalid_cursor()
    return key


def _public_value(field: str, value: Any) -> Any:
    if field not in _INTEGER_PUBLIC_FIELDS or not isinstance(value, Decimal):
        return value
    if not value.is_finite() or value != value.to_integral_value():
        raise RuntimeError(f"Public integer field {field} is invalid")
    return int(value)


def _project(item: Mapping[str, Any], fields: tuple[str, ...]) -> dict[str, Any]:
    return {
        field: _public_value(field, item[field])
        for field in fields
        if field in item
    }


def _session_view(item: Mapping[str, Any], seller: bool = False) -> dict[str, Any]:
    fields = _SESSION_SELLER_FIELDS if seller else _SESSION_PUBLIC_FIELDS
    return _project(item, fields)


def _item_view(item: Mapping[str, Any]) -> dict[str, Any]:
    return _project(item, _ITEM_PUBLIC_FIELDS)


def _pagination_result(
    response: Mapping[str, Any],
    fields: tuple[str, ...],
    context: Mapping[str, str | None],
) -> dict[str, Any]:
    return {
        "items": [_project(item, fields) for item in response.get("Items", [])],
        "next_cursor": encode_cursor(
            response.get("LastEvaluatedKey"),
            context,
        ),
    }


def _category_view(item: Mapping[str, Any]) -> dict[str, Any]:
    return _project(item, _CATEGORY_PUBLIC_FIELDS)


def _encode_category_cursor(key: Mapping[str, Any] | None) -> str | None:
    if key is None:
        return None
    payload = {"kind": "categories", "key": dict(key)}
    encoded = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    )
    return encoded.rstrip(b"=").decode("ascii")


def _decode_category_cursor(value: Any) -> dict[str, Any] | None:
    if value is None:
        return None
    if not isinstance(value, str) or not value:
        raise _invalid_cursor()
    try:
        padded = value + "=" * (-len(value) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
    except (ValueError, TypeError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise _invalid_cursor() from error
    key = payload.get("key") if isinstance(payload, dict) else None
    if not isinstance(payload, dict) or payload.get("kind") != "categories":
        raise _invalid_cursor()
    if not isinstance(key, dict) or set(key) != {"category_id", "status", "created_at"}:
        raise _invalid_cursor()
    if (
        not isinstance(key["category_id"], str)
        or key["status"] != "ACTIVE"
        or type(key["created_at"]) is not int
    ):
        raise _invalid_cursor()
    return key


def _list_categories(
    categories,
    *,
    page_size: int,
    cursor: str | None,
) -> dict[str, Any]:
    _validate_page_size(page_size)
    start_key = _decode_category_cursor(cursor)
    query: dict[str, Any] = {
        "IndexName": "status-index",
        "KeyConditionExpression": "#status = :active",
        "ExpressionAttributeNames": {"#status": "status"},
        "ExpressionAttributeValues": {":active": "ACTIVE"},
        "Limit": page_size,
        "ScanIndexForward": False,
    }
    if start_key is not None:
        query["ExclusiveStartKey"] = start_key
    response = categories.query(**query)
    return {
        "items": [
            _category_view(item)
            for item in response.get("Items", [])
            if item.get("status") == "ACTIVE"
        ],
        "next_token": _encode_category_cursor(response.get("LastEvaluatedKey")),
    }


def _category_id(value: Any) -> str:
    if not isinstance(value, str) or _SAFE_SEGMENT.fullmatch(value) is None:
        raise BadRequest("INVALID_CATEGORY_ID", "Category identifier is invalid")
    return value


def _get_category(categories, category_id: str) -> dict[str, Any]:
    category = categories.get_item(
        Key={"category_id": _category_id(category_id)},
        ConsistentRead=True,
    ).get("Item")
    if category is None or category.get("status") != "ACTIVE":
        raise NotFound("CATEGORY_NOT_FOUND", "Category was not found")
    return _category_view(category)


def _list_sessions(
    catalog,
    status: str | None,
    page_size: int,
    cursor: str | None,
) -> dict[str, Any]:
    _validate_status(status, _SESSION_STATUSES)
    _validate_page_size(page_size)
    context = {"kind": "sessions", "status": status}
    start_key = _decoded_cursor(cursor, _GSI2_CURSOR_FIELDS, context)
    prefix = f"STATUS#{status}#" if status is not None else "STATUS#"
    if start_key is not None and (
        start_key.get("gsi2pk") != "SESSION"
        or not start_key.get("pk", "").startswith("SESSION#")
        or start_key.get("sk") != "META"
        or not start_key.get("gsi2sk", "").startswith(prefix)
    ):
        raise _invalid_cursor()

    query = {
        "IndexName": "gsi2",
        "KeyConditionExpression": (
            "gsi2pk = :pk AND begins_with(gsi2sk, :prefix)"
        ),
        "ExpressionAttributeValues": {
            ":pk": "SESSION",
            ":prefix": prefix,
        },
        "Limit": page_size,
        "ScanIndexForward": False,
    }
    if status is None:
        query["FilterExpression"] = "#status <> :private_status"
        query["ExpressionAttributeNames"] = {"#status": "status"}
        query["ExpressionAttributeValues"][":private_status"] = (
            _SESSION_PRIVATE_STATUS
        )
    if start_key is not None:
        query["ExclusiveStartKey"] = start_key
    response = catalog.query(**query)
    return _pagination_result(response, _SESSION_PUBLIC_FIELDS, context)


def _list_mine(
    catalog,
    identity: RequestIdentity,
    page_size: int,
    cursor: str | None,
) -> dict[str, Any]:
    require_group(identity, "USER")
    _validate_page_size(page_size)
    context = {"kind": "mine", "sub": identity.sub}
    start_key = _decoded_cursor(cursor, _GSI1_CURSOR_FIELDS, context)
    seller_partition = f"SELLER#{identity.sub}"
    if start_key is not None and (
        start_key.get("gsi1pk") != seller_partition
        or not start_key.get("gsi1sk", "").startswith("SESSION#")
        or not start_key.get("pk", "").startswith("SESSION#")
        or start_key.get("sk") != "META"
    ):
        raise _invalid_cursor()

    query = {
        "IndexName": "gsi1",
        "KeyConditionExpression": (
            "gsi1pk = :pk AND begins_with(gsi1sk, :prefix)"
        ),
        "ExpressionAttributeValues": {
            ":pk": seller_partition,
            ":prefix": "SESSION#",
        },
        "Limit": page_size,
        "ScanIndexForward": False,
    }
    if start_key is not None:
        query["ExclusiveStartKey"] = start_key
    response = catalog.query(**query)
    return _pagination_result(response, _SESSION_SELLER_FIELDS, context)


def _get_session(
    catalog,
    state_table,
    identity: RequestIdentity,
    session_id: str,
) -> dict[str, Any]:
    session_response = catalog.get_item(
        Key=session_key(session_id),
        ConsistentRead=True,
    )
    session = session_response.get("Item")
    if session is None:
        raise NotFound("SESSION_NOT_FOUND", "Session was not found")
    if (
        session.get("status") == _SESSION_PRIVATE_STATUS
        and identity.sub != session.get("seller_sub")
        and "ADMIN" not in identity.groups
    ):
        raise NotFound("SESSION_NOT_FOUND", "Session was not found")
    rules = catalog.get_item(
        Key=rules_key(session_id),
        ConsistentRead=True,
    ).get("Item")

    items = []
    start_key = None
    for _page in range(_MAX_SESSION_ITEM_QUERY_PAGES):
        query = {
            "KeyConditionExpression": (
                "pk = :pk AND begins_with(sk, :item_prefix)"
            ),
            "ExpressionAttributeValues": {
                ":pk": f"SESSION#{session_id}",
                ":item_prefix": "ITEM#",
            },
            "ConsistentRead": True,
        }
        if start_key is not None:
            query["ExclusiveStartKey"] = start_key
        response = catalog.query(**query)
        items.extend(
            record
            for record in response.get("Items", [])
            if record.get("entity_type") == "ITEM"
            and record.get("sk", "").startswith("ITEM#")
        )
        start_key = response.get("LastEvaluatedKey")
        if start_key is None:
            break
    else:
        raise RuntimeError("Session item query exceeded page limit")

    items.sort(key=lambda item: item.get("sequence_number", 0))
    item_views = []
    for item in items:
        item_view = _item_view(item)
        if item.get("status") == "LIVE":
            state = state_table.get_item(
                Key={"item_id": item["item_id"]},
                ConsistentRead=True,
            ).get("Item")
            if state is None:
                raise Conflict(
                    "ITEM_STATE_MISSING",
                    "Live item state is unavailable",
                )
            item_view["live"] = _project(state, _LIVE_PUBLIC_FIELDS)
        item_views.append(item_view)

    return {
        "session": _session_view(session),
        "rules": (
            _project(rules, _RULES_PUBLIC_FIELDS) if rules is not None else None
        ),
        "items": item_views,
    }


def _list_items(
    catalog,
    status: str | None,
    page_size: int,
    cursor: str | None,
    session_id: str | None = None,
    category_id: str | None = None,
) -> dict[str, Any]:
    _validate_status(status, _ITEM_STATUSES)
    _validate_page_size(page_size)
    context = {
        "kind": "items",
        "status": status,
        "session_id": session_id,
        "category_id": category_id,
    }
    cursor_fields = (
        _BASE_CURSOR_FIELDS if session_id is not None else _GSI2_CURSOR_FIELDS
    )
    start_key = _decoded_cursor(cursor, cursor_fields, context)
    filters = []
    expression_names = {}
    if session_id is not None:
        if start_key is not None and (
            start_key.get("pk") != f"SESSION#{session_id}"
            or not start_key.get("sk", "").startswith("ITEM#")
        ):
            raise _invalid_cursor()
        expression_values = {
            ":pk": f"SESSION#{session_id}",
            ":item_prefix": "ITEM#",
        }
        base_query = {
            "KeyConditionExpression": (
                "pk = :pk AND begins_with(sk, :item_prefix)"
            ),
            "ExpressionAttributeValues": expression_values,
            "ConsistentRead": True,
        }
        if status is not None:
            filters.append("#status = :status")
            expression_values[":status"] = status
            expression_names["#status"] = "status"
    else:
        prefix = f"STATUS#{status}#" if status is not None else "STATUS#"
        if start_key is not None and (
            start_key.get("gsi2pk") != "ITEM"
            or not start_key.get("pk", "").startswith("SESSION#")
            or not start_key.get("sk", "").startswith("ITEM#")
            or not start_key.get("gsi2sk", "").startswith(prefix)
        ):
            raise _invalid_cursor()
        expression_values = {
            ":pk": "ITEM",
            ":prefix": prefix,
        }
        base_query = {
            "IndexName": "gsi2",
            "KeyConditionExpression": (
                "gsi2pk = :pk AND begins_with(gsi2sk, :prefix)"
            ),
            "ExpressionAttributeValues": expression_values,
            "ScanIndexForward": False,
        }
    if status is None:
        filters.append("#status <> :private_status")
        expression_values[":private_status"] = _ITEM_PRIVATE_STATUS
        expression_names["#status"] = "status"
    if category_id is not None:
        filters.append("category_id = :category_id")
        expression_values[":category_id"] = category_id

    if filters:
        base_query["FilterExpression"] = " AND ".join(filters)
    if expression_names:
        base_query["ExpressionAttributeNames"] = expression_names

    items = []
    last_evaluated_key = start_key
    max_batches = _MAX_FILTER_QUERY_BATCHES if filters else 1
    for _batch in range(max_batches):
        query = dict(base_query)
        query["Limit"] = page_size - len(items)
        if last_evaluated_key is not None:
            query["ExclusiveStartKey"] = last_evaluated_key
        response = catalog.query(**query)
        items.extend(response.get("Items", []))
        last_evaluated_key = response.get("LastEvaluatedKey")
        if len(items) >= page_size or last_evaluated_key is None:
            break

    return {
        "items": [_item_view(item) for item in items[:page_size]],
        "next_cursor": encode_cursor(last_evaluated_key, context),
    }


def _get_item(
    catalog,
    state_table,
    identity: RequestIdentity,
    item_id: str,
) -> dict[str, Any]:
    item = load_item_by_id(catalog, item_id)
    if (
        item.get("status") == _ITEM_PRIVATE_STATUS
        and identity.sub != item.get("seller_sub")
        and "ADMIN" not in identity.groups
    ):
        raise NotFound("ITEM_NOT_FOUND", "Item was not found")
    result = _item_view(item)
    if item.get("status") != "LIVE":
        return result

    state_response = state_table.get_item(
        Key={"item_id": item_id},
        ConsistentRead=True,
    )
    state = state_response.get("Item")
    if state is None:
        raise Conflict(
            "ITEM_STATE_MISSING",
            "Live item state is unavailable",
        )
    result["live"] = _project(state, _LIVE_PUBLIC_FIELDS)
    return result


def _my_bids(
    events,
    identity: RequestIdentity,
    page_size: int,
    cursor: str | None,
) -> dict[str, Any]:
    require_group(identity, "USER")
    _validate_page_size(page_size)
    context = {"kind": "bids", "sub": identity.sub}
    start_key = _decoded_cursor(cursor, _BID_CURSOR_FIELDS, context)
    if start_key is not None and start_key.get("bidder_sub") != identity.sub:
        raise _invalid_cursor()

    query = {
        "IndexName": "bidder_sub-sk-index",
        "KeyConditionExpression": "bidder_sub = :sub",
        "ExpressionAttributeValues": {":sub": identity.sub},
        "Limit": page_size,
        "ScanIndexForward": False,
    }
    if start_key is not None:
        query["ExclusiveStartKey"] = start_key
    response = events.query(**query)
    return _pagination_result(response, _BID_PUBLIC_FIELDS, context)


def _query_parameters() -> Mapping[str, Any]:
    parameters = app.current_event.raw_event.get("queryStringParameters")
    if parameters is None:
        return {}
    if not isinstance(parameters, Mapping):
        raise _invalid_query()
    return parameters


def _page_size(parameters: Mapping[str, Any]) -> int:
    raw_page_size = parameters.get("pageSize")
    if raw_page_size is None:
        return 20
    if not isinstance(raw_page_size, str):
        raise _invalid_query()
    try:
        page_size = int(raw_page_size)
    except ValueError as error:
        raise _invalid_query() from error
    _validate_page_size(page_size)
    return page_size


def _optional_text(parameters: Mapping[str, Any], name: str) -> str | None:
    value = parameters.get(name)
    if value is None:
        return None
    if not isinstance(value, str) or not value.strip():
        raise _invalid_query()
    return value.strip()

def _current_user_profile(identity: RequestIdentity) -> dict[str, Any]:
    claims = identity.claims

    email = claims.get("email")
    if not isinstance(email, str):
        email = ""

    full_name = claims.get("name")
    if not isinstance(full_name, str) or not full_name.strip():
        full_name = claims.get("cognito:username")

    if not isinstance(full_name, str) or not full_name.strip():
        full_name = email

    phone = claims.get("phone_number")
    if not isinstance(phone, str):
        phone = ""

    role = "ADMIN" if "ADMIN" in identity.groups else "USER"

    return {
        "id": identity.sub,
        "email": email,
        "fullName": full_name,
        "phone": phone,
        "role": role,
        "status": "ACTIVE",
        "isPrimaryAdmin": False,
        "createdAt": None,
        "updatedAt": None,
    }


@app.get("/api/v1/users/me")
def get_current_user_profile() -> Response:
    identity = identity_from_event(app.current_event.raw_event)
    data = _current_user_profile(identity)

    return _response(
        200,
        "USER_PROFILE_FOUND",
        "User profile retrieved successfully",
        data,
    )

@app.get("/api/v1/categories")
def list_categories() -> Response:
    parameters = _query_parameters()
    data = _list_categories(
        _category_table(),
        page_size=_page_size(parameters),
        cursor=parameters.get("paginationToken"),
    )
    return _response(200, "CATEGORIES_LISTED", "Categories listed", data)


@app.get("/api/v1/categories/<category_id>")
def get_category(category_id: str) -> Response:
    return _response(
        200,
        "CATEGORY_FOUND",
        "Category found",
        _get_category(_category_table(), category_id),
    )


@app.get("/api/v1/auction-sessions")
def list_sessions() -> Response:
    parameters = _query_parameters()
    data = _list_sessions(
        _catalog_table(),
        status=_optional_text(parameters, "status"),
        page_size=_page_size(parameters),
        cursor=parameters.get("cursor"),
    )
    return _response(200, "SESSIONS_LISTED", "Sessions listed", data)


@app.get("/api/v1/auction-sessions/mine")
def list_mine() -> Response:
    parameters = _query_parameters()
    identity = identity_from_event(app.current_event.raw_event)
    data = _list_mine(
        _catalog_table(),
        identity,
        page_size=_page_size(parameters),
        cursor=parameters.get("cursor"),
    )
    return _response(200, "SESSIONS_LISTED", "Sessions listed", data)


@app.get("/api/v1/auction-sessions/<session_id>")
def get_session(session_id: str) -> Response:
    identity = identity_from_event(app.current_event.raw_event)
    data = _get_session(_catalog_table(), _state_table(), identity, session_id)
    return _response(200, "SESSION_FOUND", "Session found", data)


@app.get("/api/v1/auction-items")
def list_items() -> Response:
    parameters = _query_parameters()
    data = _list_items(
        _catalog_table(),
        status=_optional_text(parameters, "status"),
        page_size=_page_size(parameters),
        cursor=parameters.get("cursor"),
        session_id=_optional_text(parameters, "sessionId"),
        category_id=_optional_text(parameters, "categoryId"),
    )
    return _response(200, "ITEMS_LISTED", "Items listed", data)


@app.get("/api/v1/auction-items/<item_id>")
def get_item(item_id: str) -> Response:
    identity = identity_from_event(app.current_event.raw_event)
    data = _get_item(_catalog_table(), _state_table(), identity, item_id)
    return _response(200, "ITEM_FOUND", "Item found", data)


@app.get("/api/v1/bids/my")
def my_bids() -> Response:
    parameters = _query_parameters()
    identity = identity_from_event(app.current_event.raw_event)
    data = _my_bids(
        _events_table(),
        identity,
        page_size=_page_size(parameters),
        cursor=parameters.get("cursor"),
    )
    return _response(200, "BIDS_LISTED", "Bids listed", data)


@app.exception_handler(ServiceError)
def handle_service_error(error: ServiceError) -> Response:
    return _response(error.status_code, error.code, error.message)


@app.exception_handler(json.JSONDecodeError)
def handle_invalid_json(_error: json.JSONDecodeError) -> Response:
    return _response(
        400,
        "INVALID_JSON",
        "Request body must be valid JSON",
    )


@app.exception_handler(ResolverNotFoundError)
def handle_route_not_found(_error: ResolverNotFoundError) -> Response:
    return _response(404, "ROUTE_NOT_FOUND", "Route was not found")


@app.exception_handler(Exception)
def handle_unexpected_error(_error: Exception) -> Response:
    logger.exception("Unhandled query service error")
    return _response(500, "INTERNAL_ERROR", "Internal server error")


def handler(event, context):
    return app.resolve(event, context)
