from __future__ import annotations

import base64
import hashlib
import json
import re
import time
import unicodedata
import uuid
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
    decode_cursor,
    encode_cursor,
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
    request_origin_from_event,
    require_group,
)
from auction_common.models import (
    AdminAccountCreateRequest,
    AdminCategoryCreateRequest,
    AdminCategoryUpdateRequest,
    AdminUserStatusRequest,
    ControlPlaneRules,
    ScheduleSessionRequest,
)


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
_COGNITO_MAX_PAGE_SIZE = 60
_MAX_COGNITO_PAGES = 100
_CATEGORY_SLUG = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_ADMIN_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_AUDIT_RETENTION_SECONDS = 90 * 24 * 60 * 60
_INVITATION_RESEND_RETRY_DELAYS = (0.25, 0.5, 1.0)
_INVITATION_RESEND_TRANSIENT_ERRORS = frozenset(
    {
        "AliasExistsException",
        "LimitExceededException",
        "TooManyRequestsException",
        "UsernameExistsException",
    }
)
_SESSION_LIFECYCLE_STATUSES = frozenset(
    {"DRAFT", "SCHEDULED", "LIVE", "COMPLETED", "CANCELLED"}
)
_SESSION_REVIEW_STATUSES = frozenset({"PENDING", "APPROVED", "REJECTED"})
_ADMIN_SESSION_CURSOR_FIELDS = frozenset({"pk", "sk", "gsi2pk", "gsi2sk"})


def _normalize_category_name(value: Any) -> str:
    if not isinstance(value, str):
        raise BadRequest("INVALID_CATEGORY_NAME", "Category name is invalid")
    name = value.strip()
    if not name or len(name) > 150:
        raise BadRequest("INVALID_CATEGORY_NAME", "Category name is invalid")
    return name


def _slugify_category_name(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = "".join(
        character for character in normalized if not unicodedata.combining(character)
    )
    return re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()).strip("-")


def _normalize_category_slug(value: Any, name: str | None = None) -> str:
    if value is None:
        if name is None:
            raise BadRequest("INVALID_CATEGORY_SLUG", "Category slug is invalid")
        slug = _slugify_category_name(_normalize_category_name(name))
    elif isinstance(value, str):
        slug = value.strip()
    else:
        raise BadRequest("INVALID_CATEGORY_SLUG", "Category slug is invalid")
    if not slug or len(slug) > 150 or not _CATEGORY_SLUG.fullmatch(slug):
        raise BadRequest("INVALID_CATEGORY_SLUG", "Category slug is invalid")
    return slug


def _require_bootstrap_admin(identity: RequestIdentity) -> None:
    bootstrap_sub = getattr(get_config(), "BOOTSTRAP_ADMIN_SUB", "")
    if not bootstrap_sub or identity.sub != bootstrap_sub:
        raise Forbidden(
            "Only the bootstrap Admin can perform this operation",
            code="PRIMARY_ADMIN_REQUIRED",
        )


def _audit_event(
    identity: RequestIdentity,
    *,
    action: str,
    resource_type: str,
    resource_id: str,
    request_id: str,
    now: int | float,
    reason: dict[str, Any] | None = None,
) -> dict[str, Any]:
    timestamp = int(now)
    event_id = uuid.uuid4().hex
    safe_reason: dict[str, str] = {}
    if isinstance(reason, dict):
        for key in ("status", "from_status", "to_status", "category_id", "reason"):
            value = reason.get(key)
            if isinstance(value, str) and value.strip():
                safe_reason[key] = value.strip()[:200]
        email = reason.get("email")
        if isinstance(email, str) and "@" in email:
            safe_reason["email_domain"] = email.rsplit("@", 1)[-1].lower()[:254]
    event = {
        "pk": "AUDIT",
        "sk": f"{timestamp * 1000:013d}#{event_id}",
        "event_id": event_id,
        "actor_sub": identity.sub,
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "resource_key": f"{resource_type}#{resource_id}",
        "outcome": "SUCCESS",
        "request_id": request_id,
        "timestamp": timestamp,
        "expires_at": timestamp + _AUDIT_RETENTION_SECONDS,
    }
    if safe_reason:
        event["reason"] = safe_reason
    return event


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
def _category_table():
    return _configured_table(get_config().T_CATEGORY_CATALOG)


@lru_cache(maxsize=1)
def _audit_table():
    return _configured_table(get_config().T_ADMIN_AUDIT_EVENTS)


@lru_cache(maxsize=1)
def _scheduler_client():
    return boto3.client("scheduler")


@lru_cache(maxsize=1)
def _cognito_client():
    return boto3.client("cognito-idp")


def _cognito_pool_id() -> str:
    pool_id = get_config().COGNITO_USER_POOL_ID
    if not pool_id:
        raise RuntimeError("COGNITO_USER_POOL_ID is not configured")
    return pool_id


def _raise_cognito_error(error: ClientError) -> None:
    code = _client_error_code(error)
    if code == "UserNotFoundException":
        raise NotFound("USER_NOT_FOUND", "User was not found") from error
    if code in {"UsernameExistsException", "AliasExistsException"}:
        raise Conflict("ADMIN_EMAIL_EXISTS", "An account with this email already exists") from error
    if code == "InvalidParameterException":
        raise BadRequest("INVALID_USER_REQUEST", "User request is invalid") from error
    if code in {"TooManyRequestsException", "LimitExceededException"}:
        raise Conflict("USER_SERVICE_THROTTLED", "User service is temporarily busy") from error
    raise error


def _cognito_request(operation: str, **kwargs):
    try:
        return getattr(_cognito_client(), operation)(**kwargs)
    except ClientError as error:
        _raise_cognito_error(error)


def _resend_admin_invitation(email: str) -> None:
    for attempt, delay in enumerate(
        (*_INVITATION_RESEND_RETRY_DELAYS, None), start=1
    ):
        try:
            _cognito_client().admin_create_user(
                UserPoolId=_cognito_pool_id(),
                Username=email,
                MessageAction="RESEND",
                DesiredDeliveryMediums=["EMAIL"],
            )
            return
        except ClientError as error:
            code = _client_error_code(error)
            if code not in _INVITATION_RESEND_TRANSIENT_ERRORS or delay is None:
                _raise_cognito_error(error)
            logger.warning(
                "Retrying transient Cognito invitation resend",
                extra={"error_code": code, "retry_attempt": attempt},
            )
            time.sleep(delay)


def _cognito_attributes(user: dict[str, Any]) -> dict[str, str]:
    attributes = user.get("Attributes")
    if not isinstance(attributes, list):
        attributes = user.get("UserAttributes", [])
    if not isinstance(attributes, list):
        return {}
    return {
        entry.get("Name"): entry.get("Value")
        for entry in attributes
        if isinstance(entry, dict)
        and isinstance(entry.get("Name"), str)
        and isinstance(entry.get("Value"), str)
    }


def _iso_datetime(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    isoformat = getattr(value, "isoformat", None)
    if callable(isoformat):
        return isoformat().replace("+00:00", "Z")
    return str(value)


def _admin_user_from_cognito(user: dict[str, Any]) -> dict[str, Any]:
    attributes = _cognito_attributes(user)
    sub = user.get("Username") or attributes.get("sub")
    if not isinstance(sub, str) or not sub:
        raise Conflict("USER_DATA_INVALID", "User data is invalid")
    groups_response = _cognito_request(
        "admin_list_groups_for_user",
        UserPoolId=_cognito_pool_id(),
        Username=sub,
    )
    groups = {
        group.get("GroupName")
        for group in groups_response.get("Groups", [])
        if isinstance(group, dict) and isinstance(group.get("GroupName"), str)
    }
    enabled = user.get("Enabled") is True
    return {
        "sub": sub,
        "email": attributes.get("email"),
        "full_name": attributes.get("name") or attributes.get("custom:full_name"),
        "phone": attributes.get("phone_number"),
        "role": "ADMIN" if "ADMIN" in groups else "USER",
        "status": "ACTIVE" if enabled else "BANNED",
        "enabled": enabled,
        "cognito_status": user.get("UserStatus"),
        "is_primary_admin": sub == get_config().BOOTSTRAP_ADMIN_SUB,
        "created_at": _iso_datetime(user.get("UserCreateDate")),
        "updated_at": _iso_datetime(user.get("UserLastModifiedDate")),
    }


def _admin_user_from_sub(sub: str) -> dict[str, Any]:
    user = _cognito_request(
        "admin_get_user",
        UserPoolId=_cognito_pool_id(),
        Username=sub,
    )
    return _admin_user_from_cognito(user)


def _admin_user_query() -> dict[str, str]:
    raw = app.current_event.raw_event.get("queryStringParameters") or {}
    return {
        str(key): str(value)
        for key, value in raw.items()
        if isinstance(key, str) and value is not None
    } if isinstance(raw, dict) else {}


def _admin_user_page_size(query: dict[str, str]) -> int:
    raw = query.get("pageSize", "20")
    try:
        page_size = int(raw)
    except (TypeError, ValueError) as error:
        raise BadRequest("INVALID_PAGE_SIZE", "pageSize is invalid") from error
    if not 1 <= page_size <= _COGNITO_MAX_PAGE_SIZE:
        raise BadRequest("INVALID_PAGE_SIZE", "pageSize is invalid")
    return page_size


def _admin_user_matches(
    user: dict[str, Any],
    *,
    keyword: str | None,
    role: str | None,
    status: str | None,
) -> bool:
    if role is not None and user["role"] != role:
        return False
    if status is not None and user["status"] != status:
        return False
    if keyword is None:
        return True
    normalized = keyword.casefold()
    return any(
        isinstance(user.get(field), str) and normalized in user[field].casefold()
        for field in ("email", "full_name", "sub")
    )


def _list_admin_users(
    identity: RequestIdentity,
    *,
    role_override: str | None = None,
) -> dict[str, Any]:
    _require_operator(identity, "users")
    query = _admin_user_query()
    page_size = _admin_user_page_size(query)
    role = role_override or query.get("role")
    status = query.get("status")
    if role is not None:
        role = role.upper()
        if role not in {"USER", "ADMIN"}:
            raise BadRequest("INVALID_USER_ROLE", "role is invalid")
    if status is not None:
        status = status.upper()
        if status not in {"ACTIVE", "BANNED"}:
            raise BadRequest("INVALID_USER_STATUS", "status is invalid")
    keyword = query.get("keyword", "").strip() or None
    request_token = query.get("paginationToken")
    items: list[dict[str, Any]] = []
    next_token = request_token

    for _ in range(_MAX_COGNITO_PAGES):
        request = {"UserPoolId": _cognito_pool_id(), "Limit": page_size}
        if next_token:
            request["PaginationToken"] = next_token
        page = _cognito_request("list_users", **request)
        for raw_user in page.get("Users", []):
            user = _admin_user_from_cognito(raw_user)
            if _admin_user_matches(user, keyword=keyword, role=role, status=status):
                items.append(user)
                if len(items) >= page_size:
                    break
        next_token = page.get("PaginationToken")
        if len(items) >= page_size or not next_token:
            break

    return {"items": items[:page_size], "next_token": next_token}


def _normalize_admin_email(value: Any) -> str:
    if not isinstance(value, str):
        raise BadRequest("INVALID_ADMIN_EMAIL", "Admin email is invalid")
    email = value.strip().lower()
    if len(email) > 254 or _ADMIN_EMAIL.fullmatch(email) is None:
        raise BadRequest("INVALID_ADMIN_EMAIL", "Admin email is invalid")
    return email


def _admin_target(identity: RequestIdentity, user_id: str) -> dict[str, Any]:
    target = _admin_user_from_sub(user_id)
    if target["role"] != "ADMIN":
        raise NotFound("ADMIN_NOT_FOUND", "Admin account was not found")
    if target["is_primary_admin"] or target["sub"] == identity.sub:
        raise Forbidden("The bootstrap Admin account cannot be changed", code="PRIMARY_ADMIN_REQUIRED")
    return target


def _create_admin_account(
    identity: RequestIdentity,
    body: AdminAccountCreateRequest,
    *,
    now: int,
) -> dict[str, Any]:
    _require_bootstrap_admin(identity)
    email = _normalize_admin_email(body.email)
    attributes = [
        {"Name": "email", "Value": email},
        {"Name": "name", "Value": body.full_name.strip()},
    ]
    if body.phone is not None and body.phone.strip():
        attributes.append({"Name": "phone_number", "Value": body.phone.strip()})
    response = _cognito_request(
        "admin_create_user",
        UserPoolId=_cognito_pool_id(),
        Username=email,
        UserAttributes=attributes,
        DesiredDeliveryMediums=["EMAIL"],
        ForceAliasCreation=False,
    )
    created_user = response.get("User")
    if not isinstance(created_user, dict):
        raise Conflict("ADMIN_CREATE_FAILED", "Admin account could not be created")
    created_sub = created_user.get("Username")
    if not isinstance(created_sub, str) or not created_sub:
        raise Conflict("ADMIN_CREATE_FAILED", "Admin account data is invalid")
    _cognito_request(
        "admin_add_user_to_group",
        UserPoolId=_cognito_pool_id(),
        Username=created_sub,
        GroupName="ADMIN",
    )
    result = _admin_user_from_sub(created_sub)
    _write_audit(
        _audit_event(
            identity,
            action="ADMIN_INVITED",
            resource_type="ADMIN",
            resource_id=created_sub,
            request_id=_request_id(),
            now=now,
            reason={"email": email},
        )
    )
    return result


def _update_admin_account_status(
    identity: RequestIdentity,
    user_id: str,
    body: AdminUserStatusRequest,
    *,
    now: int,
) -> dict[str, Any]:
    _require_bootstrap_admin(identity)
    target = _admin_target(identity, user_id)
    if target["status"] == body.status:
        raise Conflict("USER_STATUS_UNCHANGED", "User already has this status")
    operation = "admin_enable_user" if body.status == "ACTIVE" else "admin_disable_user"
    _cognito_request(
        operation,
        UserPoolId=_cognito_pool_id(),
        Username=user_id,
    )
    result = _admin_user_from_sub(user_id)
    _write_audit(
        _audit_event(
            identity,
            action="USER_STATUS_UPDATED",
            resource_type="ADMIN",
            resource_id=user_id,
            request_id=_request_id(),
            now=now,
            reason={"from_status": target["status"], "to_status": body.status},
        )
    )
    return result


def _reset_admin_invitation(
    identity: RequestIdentity,
    user_id: str,
    *,
    now: int,
) -> dict[str, Any]:
    _require_bootstrap_admin(identity)
    target = _admin_target(identity, user_id)
    email = target.get("email")
    if not isinstance(email, str) or not email:
        raise Conflict("USER_DATA_INVALID", "Admin email is unavailable")
    _resend_admin_invitation(email)
    result = _admin_user_from_sub(user_id)
    _write_audit(
        _audit_event(
            identity,
            action="ADMIN_INVITATION_RESET",
            resource_type="ADMIN",
            resource_id=user_id,
            request_id=_request_id(),
            now=now,
        )
    )
    return result


def _update_user_status(
    identity: RequestIdentity,
    user_id: str,
    body: AdminUserStatusRequest,
    *,
    now: int,
) -> dict[str, Any]:
    config = get_config()
    if user_id in {identity.sub, config.BOOTSTRAP_ADMIN_SUB}:
        raise Forbidden()
    target = _admin_user_from_sub(user_id)
    if target["role"] == "ADMIN" and identity.sub != config.BOOTSTRAP_ADMIN_SUB:
        raise Forbidden(
            "Only the bootstrap Admin can change an Admin account",
            code="PRIMARY_ADMIN_REQUIRED",
        )
    if target["status"] == body.status:
        raise Conflict("USER_STATUS_UNCHANGED", "User already has this status")
    operation = "admin_enable_user" if body.status == "ACTIVE" else "admin_disable_user"
    _cognito_request(
        operation,
        UserPoolId=_cognito_pool_id(),
        Username=user_id,
    )
    result = _admin_user_from_sub(user_id)
    _write_audit(
        _audit_event(
            identity,
            action="USER_STATUS_UPDATED",
            resource_type="USER",
            resource_id=user_id,
            request_id=_request_id(),
            now=now,
            reason={"from_status": target["status"], "to_status": body.status},
        )
    )
    return result


def _request_id() -> str:
    current_event = getattr(app, "current_event", None)
    raw_event = getattr(current_event, "raw_event", {})
    context = raw_event.get("requestContext", {})
    request_id = context.get("requestId") if isinstance(context, dict) else None
    return request_id if isinstance(request_id, str) and request_id else "unknown"


def _write_audit(event: dict[str, Any]) -> None:
    table_name = getattr(get_config(), "T_ADMIN_AUDIT_EVENTS", "")
    if not table_name:
        return
    _audit_table().put_item(
        Item=event,
        ConditionExpression="attribute_not_exists(pk) AND attribute_not_exists(sk)",
    )


def _category_view(category: dict[str, Any]) -> dict[str, Any]:
    return {
        field: category[field]
        for field in (
            "category_id",
            "name",
            "slug",
            "status",
            "created_at",
            "updated_at",
        )
        if field in category
    }


def _scan_categories(table) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    start_key = None
    for _ in range(_MAX_COGNITO_PAGES):
        request: dict[str, Any] = {"Limit": 100}
        if start_key is not None:
            request["ExclusiveStartKey"] = start_key
        response = table.scan(**request)
        items.extend(
            item
            for item in response.get("Items", [])
            if isinstance(item, dict)
        )
        start_key = response.get("LastEvaluatedKey")
        if not start_key:
            break
    return items


def _category_page_size(query: dict[str, str]) -> int:
    raw = query.get("pageSize", "20")
    try:
        page_size = int(raw)
    except (TypeError, ValueError) as error:
        raise BadRequest("INVALID_PAGE_SIZE", "pageSize is invalid") from error
    if not 1 <= page_size <= 100:
        raise BadRequest("INVALID_PAGE_SIZE", "pageSize is invalid")
    return page_size


def _category_cursor(
    category_id: str | None,
    *,
    include_inactive: bool,
    status: str | None,
    keyword: str | None,
) -> str | None:
    if category_id is None:
        return None
    payload = {
        "kind": "admin-categories" if include_inactive else "categories",
        "category_id": category_id,
        "status": status,
        "keyword": keyword,
    }
    encoded = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    )
    return encoded.rstrip(b"=").decode("ascii")


def _decode_category_cursor(
    value: str | None,
    *,
    include_inactive: bool,
    status: str | None,
    keyword: str | None,
) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str) or not value:
        raise BadRequest("INVALID_CURSOR", "Cursor is invalid")
    try:
        padded = value + "=" * (-len(value) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise BadRequest("INVALID_CURSOR", "Cursor is invalid") from error
    expected_kind = "admin-categories" if include_inactive else "categories"
    if not isinstance(payload, dict) or payload != {
        "category_id": payload.get("category_id") if isinstance(payload, dict) else None,
        "keyword": keyword,
        "kind": expected_kind,
        "status": status,
    }:
        raise BadRequest("INVALID_CURSOR", "Cursor is invalid")
    category_id = payload.get("category_id")
    if not isinstance(category_id, str) or _SAFE_SEGMENT.fullmatch(category_id) is None:
        raise BadRequest("INVALID_CURSOR", "Cursor is invalid")
    return category_id


def _list_categories(
    table,
    *,
    include_inactive: bool,
    status: str | None,
    keyword: str | None,
    page_size: int,
    pagination_token: str | None,
) -> dict[str, Any]:
    if status is not None:
        status = status.upper()
        if status not in {"ACTIVE", "INACTIVE"}:
            raise BadRequest("INVALID_CATEGORY_STATUS", "status is invalid")
    if not include_inactive:
        status = "ACTIVE"
    keyword = keyword.strip().casefold() if keyword else None
    cursor_id = _decode_category_cursor(
        pagination_token,
        include_inactive=include_inactive,
        status=status,
        keyword=keyword,
    )
    categories = []
    for category in _scan_categories(table):
        category_status = category.get("status")
        if status is not None and category_status != status:
            continue
        if keyword and not any(
            isinstance(category.get(field), str)
            and keyword in category[field].casefold()
            for field in ("name", "slug")
        ):
            continue
        categories.append(category)
    categories.sort(key=lambda item: (item.get("created_at", 0), item.get("category_id", "")))
    if cursor_id is not None:
        positions = [
            index
            for index, category in enumerate(categories)
            if category.get("category_id") == cursor_id
        ]
        if not positions:
            raise BadRequest("INVALID_CURSOR", "Cursor is invalid")
        categories = categories[positions[0] + 1 :]
    page = categories[:page_size]
    next_id = page[-1].get("category_id") if len(categories) > page_size else None
    return {
        "items": [_category_view(category) for category in page],
        "next_token": _category_cursor(
            next_id,
            include_inactive=include_inactive,
            status=status,
            keyword=keyword,
        ),
    }


def _category_duplicate(
    categories: list[dict[str, Any]],
    *,
    name: str,
    slug: str,
    exclude_id: str | None = None,
) -> str | None:
    for category in categories:
        if category.get("category_id") == exclude_id:
            continue
        if isinstance(category.get("name"), str) and category["name"].casefold() == name.casefold():
            return "CATEGORY_NAME_EXISTS"
        if isinstance(category.get("slug"), str) and category["slug"].casefold() == slug.casefold():
            return "CATEGORY_SLUG_EXISTS"
    return None


def _create_category(
    identity: RequestIdentity,
    body: AdminCategoryCreateRequest,
    table,
    *,
    now: int,
) -> dict[str, Any]:
    _require_operator(identity, "categories")
    name = _normalize_category_name(body.name)
    slug = _normalize_category_slug(body.slug, name)
    duplicate = _category_duplicate(_scan_categories(table), name=name, slug=slug)
    if duplicate:
        raise Conflict(duplicate, "Category name or slug already exists")
    category = {
        "category_id": uuid.uuid4().hex,
        "name": name,
        "slug": slug,
        "status": "ACTIVE",
        "created_at": now,
        "updated_at": now,
    }
    try:
        table.put_item(
            Item=category,
            ConditionExpression="attribute_not_exists(category_id)",
        )
    except ClientError as error:
        if _client_error_code(error) == "ConditionalCheckFailedException":
            raise Conflict("CATEGORY_EXISTS", "Category already exists") from error
        raise
    _write_audit(
        _audit_event(
            identity,
            action="CATEGORY_CREATED",
            resource_type="CATEGORY",
            resource_id=category["category_id"],
            request_id=_request_id(),
            now=now,
            reason={"category_id": category["category_id"]},
        )
    )
    return _category_view(category)


def _update_category(
    identity: RequestIdentity,
    category_id: str,
    body: AdminCategoryUpdateRequest,
    table,
    *,
    now: int,
) -> dict[str, Any]:
    _require_operator(identity, "categories")
    category = table.get_item(Key={"category_id": category_id}, ConsistentRead=True).get("Item")
    if category is None:
        raise NotFound("CATEGORY_NOT_FOUND", "Category was not found")
    name = _normalize_category_name(body.name) if body.name is not None else category.get("name")
    slug = _normalize_category_slug(body.slug) if body.slug is not None else category.get("slug")
    name = _normalize_category_name(name)
    slug = _normalize_category_slug(slug)
    duplicate = _category_duplicate(
        _scan_categories(table),
        name=name,
        slug=slug,
        exclude_id=category_id,
    )
    if duplicate:
        raise Conflict(duplicate, "Category name or slug already exists")
    updated = {
        **category,
        "name": name,
        "slug": slug,
        "status": body.status or category.get("status", "ACTIVE"),
        "updated_at": now,
    }
    try:
        table.put_item(
            Item=updated,
            ConditionExpression="attribute_exists(category_id)",
        )
    except ClientError as error:
        if _client_error_code(error) == "ConditionalCheckFailedException":
            raise NotFound("CATEGORY_NOT_FOUND", "Category was not found") from error
        raise
    action = "CATEGORY_ARCHIVED" if updated["status"] == "INACTIVE" else "CATEGORY_UPDATED"
    _write_audit(
        _audit_event(
            identity,
            action=action,
            resource_type="CATEGORY",
            resource_id=category_id,
            request_id=_request_id(),
            now=now,
            reason={"status": updated["status"]},
        )
    )
    return _category_view(updated)


_AUDIT_PUBLIC_FIELDS = (
    "event_id",
    "actor_sub",
    "action",
    "resource_type",
    "resource_id",
    "outcome",
    "request_id",
    "timestamp",
    "reason",
)


def _audit_page_size(query: dict[str, str]) -> int:
    raw = query.get("pageSize", "50")
    try:
        page_size = int(raw)
    except (TypeError, ValueError) as error:
        raise BadRequest("INVALID_PAGE_SIZE", "pageSize is invalid") from error
    if not 1 <= page_size <= 100:
        raise BadRequest("INVALID_PAGE_SIZE", "pageSize is invalid")
    return page_size


def _audit_filter_value(query: dict[str, str], name: str) -> str | None:
    value = query.get(name)
    if value is None:
        return None
    value = value.strip()
    if not value or len(value) > 200:
        raise BadRequest("INVALID_AUDIT_FILTER", "Audit filter is invalid")
    return value


def _audit_cursor(
    key: dict[str, Any] | None,
    filters: dict[str, Any],
) -> str | None:
    if key is None:
        return None
    payload = {"kind": "audit-events", "filters": filters, "key": key}
    encoded = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    )
    return encoded.rstrip(b"=").decode("ascii")


def _decode_audit_cursor(
    value: str | None,
    filters: dict[str, Any],
) -> dict[str, Any] | None:
    if value is None:
        return None
    try:
        padded = value + "=" * (-len(value) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded).decode("utf-8"))
    except (ValueError, TypeError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise BadRequest("INVALID_CURSOR", "Cursor is invalid") from error
    key = payload.get("key") if isinstance(payload, dict) else None
    if not isinstance(payload, dict) or payload.get("kind") != "audit-events":
        raise BadRequest("INVALID_CURSOR", "Cursor is invalid")
    if payload.get("filters") != filters or not isinstance(key, dict):
        raise BadRequest("INVALID_CURSOR", "Cursor is invalid")
    if set(key) != {"pk", "sk"} or key.get("pk") != "AUDIT":
        raise BadRequest("INVALID_CURSOR", "Cursor is invalid")
    if not isinstance(key.get("sk"), str) or not key["sk"]:
        raise BadRequest("INVALID_CURSOR", "Cursor is invalid")
    return key


def _audit_view(event: dict[str, Any]) -> dict[str, Any]:
    result = {field: event[field] for field in _AUDIT_PUBLIC_FIELDS if field in event}
    reason = result.get("reason")
    if isinstance(reason, dict):
        result["reason"] = {
            key: value
            for key, value in reason.items()
            if key in {"status", "from_status", "to_status", "category_id", "reason", "email_domain"}
            and isinstance(value, str)
        }
    elif "reason" in result:
        result.pop("reason")
    return result


def _list_audit_events(table, query: dict[str, str]) -> dict[str, Any]:
    page_size = _audit_page_size(query)
    filters = {
        name: _audit_filter_value(query, name)
        for name in ("actorSub", "action", "resourceType", "outcome", "from", "to")
    }
    start_key = _decode_audit_cursor(query.get("paginationToken"), filters)
    expression_values: dict[str, Any] = {":pk": "AUDIT"}
    expression_names: dict[str, str] = {}
    filter_expressions: list[str] = []
    for query_name, field_name in (
        ("actorSub", "actor_sub"),
        ("action", "action"),
        ("resourceType", "resource_type"),
        ("outcome", "outcome"),
    ):
        value = filters[query_name]
        if value is not None:
            placeholder = f":{query_name[0].lower()}"
            name_placeholder = f"#{field_name}"
            expression_names[name_placeholder] = field_name
            expression_values[placeholder] = value
            filter_expressions.append(f"{name_placeholder} = {placeholder}")
    if filters["from"] is not None or filters["to"] is not None:
        for key, operator in (("from", ">="), ("to", "<=")):
            value = filters[key]
            if value is None:
                continue
            try:
                timestamp = int(value)
            except ValueError as error:
                raise BadRequest("INVALID_AUDIT_FILTER", "Audit time filter is invalid") from error
            placeholder = f":{key}"
            expression_values[placeholder] = timestamp
            filter_expressions.append(f"#timestamp {operator} {placeholder}")
        expression_names["#timestamp"] = "timestamp"
    request: dict[str, Any] = {
        "KeyConditionExpression": "pk = :pk",
        "ExpressionAttributeValues": expression_values,
        "Limit": page_size,
        "ScanIndexForward": False,
    }
    if expression_names:
        request["ExpressionAttributeNames"] = expression_names
    if filter_expressions:
        request["FilterExpression"] = " AND ".join(filter_expressions)
    if start_key is not None:
        request["ExclusiveStartKey"] = start_key
    response = table.query(**request)
    return {
        "items": [_audit_view(item) for item in response.get("Items", [])],
        "next_token": _audit_cursor(response.get("LastEvaluatedKey"), filters),
    }


def _admin_session_query() -> dict[str, str]:
    parameters = app.current_event.raw_event.get("queryStringParameters")
    if parameters is None:
        return {}
    if not isinstance(parameters, dict):
        raise BadRequest("INVALID_QUERY", "Query parameters are invalid")
    allowed = {"status", "reviewStatus", "pageSize", "paginationToken"}
    if any(name not in allowed for name in parameters):
        raise BadRequest("INVALID_QUERY", "Query parameters are invalid")
    return {
        name: value.strip()
        for name, value in parameters.items()
        if isinstance(name, str) and isinstance(value, str)
    }


def _admin_session_page_size(query: dict[str, str]) -> int:
    raw = query.get("pageSize", "20")
    try:
        page_size = int(raw)
    except (TypeError, ValueError) as error:
        raise BadRequest("INVALID_PAGE_SIZE", "pageSize is invalid") from error
    if not 1 <= page_size <= 100:
        raise BadRequest("INVALID_PAGE_SIZE", "pageSize is invalid")
    return page_size


def _admin_session_status(query: dict[str, str], name: str) -> str | None:
    value = query.get(name)
    if value is None:
        return None
    if value not in _SESSION_LIFECYCLE_STATUSES if name == "status" else value not in _SESSION_REVIEW_STATUSES:
        raise BadRequest("INVALID_SESSION_STATUS", "Session status is invalid")
    return value


def _admin_session_view(session: dict[str, Any]) -> dict[str, Any]:
    review_status = session.get("review_status", "APPROVED")
    if review_status not in _SESSION_REVIEW_STATUSES:
        raise Conflict("PERSISTED_VALUE_INVALID", "Persisted session review status is invalid")
    result: dict[str, Any] = {}
    for field in (
        "session_id",
        "title",
        "description",
        "status",
        "review_status",
        "item_count",
        "start_time",
        "active_item_id",
        "current_sequence",
        "seller_sub",
        "version",
        "created_at",
        "updated_at",
    ):
        if field in session:
            result[field] = session[field]
    result["review_status"] = review_status
    return result


def _admin_item_view(item: dict[str, Any]) -> dict[str, Any]:
    return {
        field: item[field]
        for field in (
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
        if field in item
    }


def _list_admin_sessions(table, query: dict[str, str]) -> dict[str, Any]:
    page_size = _admin_session_page_size(query)
    status = _admin_session_status(query, "status")
    review_status = _admin_session_status(query, "reviewStatus")
    context = {
        "kind": "admin-auction-sessions",
        "status": status,
        "reviewStatus": review_status,
    }
    start_key = decode_cursor(query.get("paginationToken"), context)
    if start_key is not None and frozenset(start_key) != _ADMIN_SESSION_CURSOR_FIELDS:
        raise BadRequest("INVALID_CURSOR", "Cursor is invalid")
    values: dict[str, Any] = {":pk": "SESSION"}
    names: dict[str, str] = {}
    filters: list[str] = ["entity_type = :entity"]
    values[":entity"] = "SESSION"
    key_condition = "gsi2pk = :pk"
    if status is not None:
        key_condition += " AND begins_with(gsi2sk, :status_prefix)"
        values[":status_prefix"] = f"STATUS#{status}#"
    if review_status is not None:
        names["#review_status"] = "review_status"
        values[":review_status"] = review_status
        filters.append("#review_status = :review_status")
    request: dict[str, Any] = {
        "IndexName": "gsi2",
        "KeyConditionExpression": key_condition,
        "ExpressionAttributeValues": values,
        "FilterExpression": " AND ".join(filters),
        "Limit": page_size,
        "ScanIndexForward": False,
    }
    if names:
        request["ExpressionAttributeNames"] = names
    if start_key is not None:
        request["ExclusiveStartKey"] = start_key
    response = table.query(**request)
    return {
        "items": [_admin_session_view(item) for item in response.get("Items", [])],
        "next_token": encode_cursor(response.get("LastEvaluatedKey"), context),
    }


def _get_admin_session(table, session_id: str) -> dict[str, Any]:
    session = table.get_item(
        Key=session_key(session_id),
        ConsistentRead=True,
    ).get("Item")
    if session is None or session.get("entity_type") != "SESSION":
        raise NotFound("SESSION_NOT_FOUND", "Session was not found")
    return {
        "session": _admin_session_view(session),
        "items": [_admin_item_view(item) for item in _query_session_items(table, session_id)],
    }


def _admin_session_transition(
    command: str,
    status: str,
    review_status: str,
    *,
    active_item_id: str | None = None,
) -> dict[str, str]:
    if status not in _SESSION_LIFECYCLE_STATUSES or review_status not in _SESSION_REVIEW_STATUSES:
        raise Conflict("PERSISTED_VALUE_INVALID", "Persisted session status is invalid")
    if command in {"approve", "reject"}:
        if status not in {"DRAFT", "SCHEDULED"}:
            raise Conflict("INVALID_SESSION_TRANSITION", "Session transition is not allowed")
        target_review = "APPROVED" if command == "approve" else "REJECTED"
        target_status = "CANCELLED" if command == "reject" and status == "SCHEDULED" else status
        return {"status": target_status, "review_status": target_review}
    if command == "cancel":
        if status == "LIVE" and active_item_id:
            raise Conflict("SESSION_ACTIVE_ITEM", "Close or cancel the active item first")
        if status not in {"DRAFT", "SCHEDULED"}:
            raise Conflict("INVALID_SESSION_TRANSITION", "Session transition is not allowed")
        return {"status": "CANCELLED", "review_status": review_status}
    if command == "close":
        if status == "COMPLETED":
            return {"status": "COMPLETED", "review_status": review_status}
        if status == "LIVE" and active_item_id:
            raise Conflict("SESSION_ACTIVE_ITEM", "Close or cancel the active item first")
        if status != "LIVE":
            raise Conflict("INVALID_SESSION_TRANSITION", "Session transition is not allowed")
        return {"status": "COMPLETED", "review_status": review_status}
    raise BadRequest("INVALID_SESSION_COMMAND", "Session command is invalid")


def _session_status_sort(session_id: str, status: str, start_time: Any = None) -> str:
    normalized_start = 0
    if status == "SCHEDULED":
        normalized_start = _persisted_int(
            start_time,
            "session start time",
            minimum=0,
            maximum=_MAX_EPOCH,
        )
    return f"STATUS#{status}#START#{normalized_start:010d}#{session_id}"


def _admin_mutate_session(
    identity: RequestIdentity,
    session_id: str,
    command: str,
    table,
    scheduler,
    config,
    *,
    now: int,
) -> dict[str, Any]:
    _require_operator(identity, "session moderation")
    session = table.get_item(
        Key=session_key(session_id),
        ConsistentRead=True,
    ).get("Item")
    if session is None or session.get("entity_type") != "SESSION":
        raise NotFound("SESSION_NOT_FOUND", "Session was not found")
    current_status = session.get("status")
    current_review_status = session.get("review_status", "APPROVED")
    target = _admin_session_transition(
        command,
        current_status,
        current_review_status,
        active_item_id=session.get("active_item_id"),
    )
    if target["status"] == current_status and target["review_status"] == current_review_status:
        return _admin_session_view(session)
    version = _persisted_int(
        session.get("version"),
        "session version",
        minimum=1,
        maximum=_MAX_VERSION,
    )
    values: dict[str, Any] = {
        ":target_status": target["status"],
        ":target_review": target["review_status"],
        ":one": 1,
        ":expected_version": version,
        ":now": now,
        ":gsi2sk": _session_status_sort(
            session_id,
            target["status"],
            session.get("start_time"),
        ),
    }
    update_expression = (
        "SET #status = :target_status, review_status = :target_review, "
        "version = version + :one, gsi2sk = :gsi2sk, updated_at = :now"
    )
    if target["status"] == "CANCELLED" and current_status == "SCHEDULED":
        update_expression += " REMOVE start_time"
    try:
        table.update_item(
            Key=session_key(session_id),
            UpdateExpression=update_expression,
            ConditionExpression="#status = :source_status AND version = :expected_version",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={
                **values,
                ":source_status": current_status,
            },
            ReturnValues="ALL_NEW",
        )
    except ClientError as error:
        if _client_error_code(error) == "ConditionalCheckFailedException":
            raise Conflict("SESSION_CHANGED", "Session changed; reload and retry") from error
        raise
    if current_status == "SCHEDULED" and target["status"] == "CANCELLED":
        _delete_schedule(_start_schedule_name(session_id), scheduler, config)
    updated = {
        **session,
        "status": target["status"],
        "review_status": target["review_status"],
        "version": version + 1,
        "gsi2sk": values[":gsi2sk"],
        "updated_at": now,
    }
    if target["status"] == "CANCELLED" and current_status == "SCHEDULED":
        updated.pop("start_time", None)
    action = {
        "approve": "SESSION_APPROVED",
        "reject": "SESSION_REJECTED",
        "cancel": "SESSION_CANCELLED",
        "close": "SESSION_CLOSED",
    }[command]
    _write_audit(
        _audit_event(
            identity,
            action=action,
            resource_type="SESSION",
            resource_id=session_id,
            request_id=_request_id(),
            now=now,
            reason={
                "from_status": current_status,
                "to_status": target["status"],
                "reason": target["review_status"],
            },
        )
    )
    return _admin_session_view(updated)


def _bounded_status_count(table, partition: str, status: str, *, limit: int = 100) -> tuple[int, bool]:
    response = table.query(
        IndexName="gsi2",
        KeyConditionExpression="gsi2pk = :pk AND begins_with(gsi2sk, :prefix)",
        ExpressionAttributeValues={":pk": partition, ":prefix": f"STATUS#{status}#"},
        Limit=limit,
        Select="COUNT",
    )
    return int(response.get("Count", 0)), response.get("LastEvaluatedKey") is not None


def _admin_dashboard(table) -> dict[str, Any]:
    session_counts: dict[str, int] = {}
    item_counts: dict[str, int] = {}
    truncated = False
    for status in ("DRAFT", "SCHEDULED", "LIVE", "COMPLETED", "CANCELLED"):
        session_counts[status], is_truncated = _bounded_status_count(table, "SESSION", status)
        truncated = truncated or is_truncated
    for status in ("WAITING", "LIVE", "PAUSED", "PENDING_ADMIN_APPROVAL", "SOLD", "UNSOLD", "CANCELLED"):
        item_counts[status], is_truncated = _bounded_status_count(table, "ITEM", status)
        truncated = truncated or is_truncated
    recent = _list_admin_sessions(table, {"pageSize": "10"})
    return {
        "session_counts": session_counts,
        "item_counts": item_counts,
        "recent_sessions": recent["items"],
        "truncated": truncated,
    }


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
    if "USER" not in identity.groups:
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
    _write_audit(
        _audit_event(
            identity,
            action="ITEM_PAUSED",
            resource_type="ITEM",
            resource_id=item_id,
            request_id=_request_id(),
            now=now,
            reason={"status": "PAUSED"},
        )
    )
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
    _write_audit(
        _audit_event(
            identity,
            action="ITEM_RESUMED",
            resource_type="ITEM",
            resource_id=item_id,
            request_id=_request_id(),
            now=now,
            reason={"status": "LIVE"},
        )
    )
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


@app.get("/api/v1/admin/users")
def list_users_route() -> Response:
    identity = identity_from_event(app.current_event.raw_event)
    return _response(
        200,
        "ADMIN_USERS_LISTED",
        "Users listed",
        _list_admin_users(identity),
    )


@app.get("/api/v1/admin/categories")
def list_admin_categories_route() -> Response:
    identity = identity_from_event(app.current_event.raw_event)
    _require_operator(identity, "categories")
    query = _admin_user_query()
    data = _list_categories(
        _category_table(),
        include_inactive=True,
        status=query.get("status"),
        keyword=query.get("keyword"),
        page_size=_category_page_size(query),
        pagination_token=query.get("paginationToken"),
    )
    return _response(200, "ADMIN_CATEGORIES_LISTED", "Categories listed", data)


@app.post("/api/v1/admin/categories")
def create_admin_category_route() -> Response:
    identity = identity_from_event(app.current_event.raw_event)
    body = AdminCategoryCreateRequest.model_validate(app.current_event.json_body)
    data = _create_category(
        identity,
        body,
        _category_table(),
        now=int(time.time()),
    )
    return _response(201, "CATEGORY_CREATED", "Category created", data)


@app.patch("/api/v1/admin/categories/<category_id>")
def update_admin_category_route(category_id: str) -> Response:
    identity = identity_from_event(app.current_event.raw_event)
    normalized_category_id = _path_segment(category_id, "category")
    body = AdminCategoryUpdateRequest.model_validate(app.current_event.json_body)
    data = _update_category(
        identity,
        normalized_category_id,
        body,
        _category_table(),
        now=int(time.time()),
    )
    return _response(200, "CATEGORY_UPDATED", "Category updated", data)


@app.post("/api/v1/admin/categories/<category_id>/archive")
def archive_admin_category_route(category_id: str) -> Response:
    identity = identity_from_event(app.current_event.raw_event)
    normalized_category_id = _path_segment(category_id, "category")
    _empty_body()
    body = AdminCategoryUpdateRequest(status="INACTIVE")
    data = _update_category(
        identity,
        normalized_category_id,
        body,
        _category_table(),
        now=int(time.time()),
    )
    return _response(200, "CATEGORY_ARCHIVED", "Category archived", data)


@app.get("/api/v1/admin/dashboard")
def admin_dashboard_route() -> Response:
    identity = identity_from_event(app.current_event.raw_event)
    _require_operator(identity, "dashboard")
    return _response(
        200,
        "ADMIN_DASHBOARD_RETRIEVED",
        "Admin dashboard retrieved",
        _admin_dashboard(_catalog_table()),
    )


@app.get("/api/v1/admin/auction-sessions")
def list_admin_sessions_route() -> Response:
    identity = identity_from_event(app.current_event.raw_event)
    _require_operator(identity, "session moderation")
    return _response(
        200,
        "ADMIN_SESSIONS_LISTED",
        "Admin sessions listed",
        _list_admin_sessions(_catalog_table(), _admin_session_query()),
    )


@app.get("/api/v1/admin/auction-sessions/<session_id>")
def get_admin_session_route(session_id: str) -> Response:
    identity = identity_from_event(app.current_event.raw_event)
    _require_operator(identity, "session moderation")
    return _response(
        200,
        "ADMIN_SESSION_RETRIEVED",
        "Admin session retrieved",
        _get_admin_session(_catalog_table(), _path_segment(session_id, "session")),
    )


def _admin_session_command_route(session_id: str, command: str) -> Response:
    identity = identity_from_event(app.current_event.raw_event)
    normalized_session_id = _path_segment(session_id, "session")
    _empty_body()
    data = _admin_mutate_session(
        identity,
        normalized_session_id,
        command,
        _catalog_table(),
        _scheduler_client(),
        get_config(),
        now=int(time.time()),
    )
    code = {
        "approve": "SESSION_APPROVED",
        "reject": "SESSION_REJECTED",
        "cancel": "SESSION_CANCELLED",
        "close": "SESSION_CLOSED",
    }[command]
    message = {
        "approve": "Session approved",
        "reject": "Session rejected",
        "cancel": "Session cancelled",
        "close": "Session closed",
    }[command]
    return _response(200, code, message, data)


@app.post("/api/v1/admin/auction-sessions/<session_id>/approve")
def approve_admin_session_route(session_id: str) -> Response:
    return _admin_session_command_route(session_id, "approve")


@app.post("/api/v1/admin/auction-sessions/<session_id>/reject")
def reject_admin_session_route(session_id: str) -> Response:
    return _admin_session_command_route(session_id, "reject")


@app.post("/api/v1/admin/auction-sessions/<session_id>/cancel")
def cancel_admin_session_route(session_id: str) -> Response:
    return _admin_session_command_route(session_id, "cancel")


@app.post("/api/v1/admin/auction-sessions/<session_id>/close")
def close_admin_session_route(session_id: str) -> Response:
    return _admin_session_command_route(session_id, "close")


@app.get("/api/v1/admin/admin-accounts")
def list_admin_accounts_route() -> Response:
    identity = identity_from_event(app.current_event.raw_event)
    return _response(
        200,
        "ADMIN_ACCOUNTS_LISTED",
        "Admin accounts listed",
        _list_admin_users(identity, role_override="ADMIN"),
    )


@app.get("/api/v1/admin/audit-events")
def list_audit_events_route() -> Response:
    identity = identity_from_event(app.current_event.raw_event)
    _require_operator(identity, "audit")
    return _response(
        200,
        "AUDIT_EVENTS_LISTED",
        "Audit events listed",
        _list_audit_events(_audit_table(), _admin_user_query()),
    )


@app.post("/api/v1/admin/admin-accounts")
def create_admin_account_route() -> Response:
    identity = identity_from_event(app.current_event.raw_event)
    body = AdminAccountCreateRequest.model_validate(app.current_event.json_body)
    data = _create_admin_account(identity, body, now=int(time.time()))
    return _response(201, "ADMIN_INVITED", "Admin invitation sent", data)


@app.patch("/api/v1/admin/admin-accounts/<user_id>/status")
def update_admin_account_status_route(user_id: str) -> Response:
    identity = identity_from_event(app.current_event.raw_event)
    normalized_user_id = _path_segment(user_id, "user")
    body = AdminUserStatusRequest.model_validate(app.current_event.json_body)
    data = _update_admin_account_status(
        identity,
        normalized_user_id,
        body,
        now=int(time.time()),
    )
    return _response(200, "ADMIN_STATUS_UPDATED", "Admin status updated", data)


@app.post("/api/v1/admin/admin-accounts/<user_id>/reset-invitation")
def reset_admin_invitation_route(user_id: str) -> Response:
    identity = identity_from_event(app.current_event.raw_event)
    normalized_user_id = _path_segment(user_id, "user")
    _empty_body()
    data = _reset_admin_invitation(
        identity,
        normalized_user_id,
        now=int(time.time()),
    )
    return _response(200, "ADMIN_INVITATION_RESET", "Admin invitation reset", data)


@app.get("/api/v1/admin/users/<user_id>")
def get_user_route(user_id: str) -> Response:
    identity = identity_from_event(app.current_event.raw_event)
    _require_operator(identity, "users")
    normalized_user_id = _path_segment(user_id, "user")
    return _response(
        200,
        "ADMIN_USER_RETRIEVED",
        "User retrieved",
        _admin_user_from_sub(normalized_user_id),
    )


@app.patch("/api/v1/admin/users/<user_id>/status")
def update_user_status_route(user_id: str) -> Response:
    identity = identity_from_event(app.current_event.raw_event)
    _require_operator(identity, "users")
    normalized_user_id = _path_segment(user_id, "user")
    body = AdminUserStatusRequest.model_validate(app.current_event.json_body)
    data = _update_user_status(
        identity,
        normalized_user_id,
        body,
        now=int(time.time()),
    )
    return _response(200, "ADMIN_USER_STATUS_UPDATED", "User status updated", data)


@app.exception_handler(ServiceError)
def handle_service_error(error: ServiceError) -> Response:
    logger.info(
        "Admin command rejected",
        extra={
            "error_code": error.code,
            "status_code": error.status_code,
            "request_id": _request_id(),
        },
    )
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
