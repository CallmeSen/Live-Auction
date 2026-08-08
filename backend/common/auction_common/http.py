from __future__ import annotations

import json
import os
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit


class ServiceError(Exception):
    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


class Unauthorized(ServiceError):
    def __init__(self, message: str = "Authentication is required"):
        super().__init__(401, "UNAUTHORIZED", message)


class Forbidden(ServiceError):
    def __init__(
        self,
        message: str = "Permission denied",
        code: str = "FORBIDDEN",
    ):
        super().__init__(403, code, message)


class BadRequest(ServiceError):
    def __init__(self, code: str, message: str):
        super().__init__(400, code, message)


class NotFound(ServiceError):
    def __init__(self, code: str, message: str):
        super().__init__(404, code, message)


class Conflict(ServiceError):
    def __init__(self, code: str, message: str):
        super().__init__(409, code, message)


@dataclass(frozen=True, slots=True)
class RequestIdentity:
    sub: str
    groups: frozenset[str]
    claims: Mapping[str, Any]


def _groups(value: Any) -> frozenset[str]:
    if isinstance(value, list):
        return frozenset(
            str(group).strip() for group in value if str(group).strip()
        )
    if not isinstance(value, str):
        return frozenset()
    normalized = value.strip().strip("[]")
    return frozenset(part.strip() for part in normalized.split(",") if part.strip())


def identity_from_event(event: Any) -> RequestIdentity:
    if not isinstance(event, Mapping):
        raise Unauthorized()
    request_context = event.get("requestContext", {})
    if not isinstance(request_context, Mapping):
        raise Unauthorized()
    authorizer = request_context.get("authorizer", {})
    if not isinstance(authorizer, Mapping):
        raise Unauthorized()
    claims = authorizer.get("claims", {})
    if not isinstance(claims, Mapping):
        raise Unauthorized()

    claimed_sub = claims.get("sub")
    if not isinstance(claimed_sub, str) or not claimed_sub.strip():
        raise Unauthorized()
    sub = claimed_sub.strip()
    return RequestIdentity(
    sub=sub,
    groups=_groups(claims.get("cognito:groups")),
    claims=dict(claims),)


def request_origin_from_event(event: Any) -> str | None:
    if not isinstance(event, Mapping):
        return None
    headers = event.get("headers")
    if not isinstance(headers, Mapping):
        return None
    for name, value in headers.items():
        if isinstance(name, str) and name.lower() == "origin" and isinstance(value, str):
            return value.strip() or None
    return None


def require_group(identity: RequestIdentity, *allowed: str) -> None:
    if "ADMIN" not in identity.groups and identity.groups.isdisjoint(allowed):
        raise Forbidden()


def json_response(
    status_code: int,
    code: str,
    message: str,
    data: Any = None,
    request_origin: str | None = None,
) -> dict[str, Any]:
    headers = {"Content-Type": "application/json"}
    configured_origins: list[str] = []
    raw_origins = os.environ.get("CORS_ALLOWED_ORIGINS", "").strip()
    if raw_origins:
        try:
            parsed_origins = json.loads(raw_origins)
        except json.JSONDecodeError:
            parsed_origins = []
        if isinstance(parsed_origins, list):
            configured_origins = [
                origin.strip()
                for origin in parsed_origins
                if isinstance(origin, str) and origin.strip()
            ]
    if not configured_origins:
        configured_origins = [os.environ.get("CORS_ALLOWED_ORIGIN", "").strip()]

    def valid_origin(value: str) -> bool:
        try:
            parsed_origin = urlsplit(value)
            valid = (
                value not in {"", "*", "null"}
                and "\r" not in value
                and "\n" not in value
                and parsed_origin.scheme in {"http", "https"}
                and bool(parsed_origin.hostname)
                and parsed_origin.username is None
                and parsed_origin.password is None
                and parsed_origin.path == ""
                and parsed_origin.query == ""
                and parsed_origin.fragment == ""
            )
            if parsed_origin.port is not None and not 1 <= parsed_origin.port <= 65535:
                valid = False
            return valid
        except ValueError:
            return False

    allowed_origin = next(
        (
            candidate
            for candidate in configured_origins
            if candidate == request_origin and valid_origin(candidate)
        ),
        next((candidate for candidate in configured_origins if valid_origin(candidate)), ""),
    )

    if valid_origin(allowed_origin):
        headers.update(
            {
                "Access-Control-Allow-Origin": allowed_origin,
                "Access-Control-Allow-Headers": (
                    "Content-Type,Authorization,X-Api-Key"
                ),
                "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,OPTIONS",
            }
        )

    return {
        "statusCode": status_code,
        "headers": headers,
        "body": json.dumps(
            {
                "status": status_code,
                "code": code,
                "message": message,
                "data": data,
            },
            default=str,
        ),
    }
