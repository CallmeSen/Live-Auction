from __future__ import annotations

import json
import time
import uuid
from functools import lru_cache
from typing import Any

import boto3
from aws_lambda_powertools import Logger
from aws_lambda_powertools.event_handler import APIGatewayRestResolver, Response
from botocore.exceptions import ClientError
from pydantic import ValidationError

from auction_common.catalog import (
    rules_key,
    serialize_item,
    serialize_values,
    session_key,
    transaction_client,
)
from auction_common.config import get_config
from auction_common.http import (
    Conflict,
    Forbidden,
    NotFound,
    RequestIdentity,
    ServiceError,
    identity_from_event,
    json_response,
    require_group,
)
from auction_common.models import ControlPlaneRules, CreateSessionRequest


app = APIGatewayRestResolver()
logger = Logger(service="session-service")


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
    error_code = _client_error_code(error)
    if error_code == "ConditionalCheckFailedException":
        return True
    if error_code != "TransactionCanceledException":
        return False

    cancellation_reasons = error.response.get("CancellationReasons")
    if not isinstance(cancellation_reasons, list):
        return False
    return any(
        isinstance(reason, dict) and reason.get("Code") == "ConditionalCheckFailed"
        for reason in cancellation_reasons
    )


def _create_session(
    identity: RequestIdentity,
    body: CreateSessionRequest,
    catalog,
    session_id: str,
    now: int,
) -> dict[str, Any]:
    require_group(identity, "USER")
    item = {
        **session_key(session_id),
        "entity_type": "SESSION",
        "session_id": session_id,
        "seller_sub": identity.sub,
        "title": body.title,
        "description": body.description,
        "status": "DRAFT",
        "version": 1,
        "item_count": 0,
        "gsi1pk": f"SELLER#{identity.sub}",
        "gsi1sk": f"SESSION#{now:010d}#{session_id}",
        "gsi2pk": "SESSION",
        "gsi2sk": f"STATUS#DRAFT#START#0000000000#{session_id}",
        "created_at": now,
        "updated_at": now,
    }
    try:
        catalog.put_item(
            Item=item,
            ConditionExpression="attribute_not_exists(pk)",
        )
    except ClientError as error:
        if _client_error_code(error) == "ConditionalCheckFailedException":
            raise Conflict(
                "SESSION_ID_CONFLICT",
                "Session identifier already exists",
            ) from error
        raise

    return {"session_id": session_id, "status": "DRAFT"}


def _put_rules(
    session_id: str,
    identity: RequestIdentity,
    rules: ControlPlaneRules,
    catalog,
    expected_version: int | None = None,
    now: int | None = None,
) -> dict[str, Any]:
    require_group(identity, "USER")
    response = catalog.get_item(Key=session_key(session_id), ConsistentRead=True)
    session = response.get("Item")
    if session is None:
        raise NotFound("SESSION_NOT_FOUND", "Session was not found")

    is_admin = "ADMIN" in identity.groups
    if not is_admin and session.get("seller_sub") != identity.sub:
        raise Forbidden()
    if session.get("status") != "DRAFT":
        raise Conflict("SESSION_NOT_DRAFT", "Session is not in draft status")

    version = int(session["version"] if expected_version is None else expected_version)
    next_version = version + 1
    updated_at = int(time.time()) if now is None else now
    rules_item = {
        **rules_key(session_id),
        **rules.model_dump(),
        "entity_type": "SESSION_RULES",
        "session_id": session_id,
        "version": next_version,
        "updated_at": updated_at,
    }
    condition_expression = "#status = :draft AND version = :expected"
    expression_values = {
        ":next_version": next_version,
        ":updated_at": updated_at,
        ":draft": "DRAFT",
        ":expected": version,
    }
    if not is_admin:
        condition_expression += " AND seller_sub = :seller"
        expression_values[":seller"] = identity.sub

    transaction = [
        {
            "Put": {
                "TableName": catalog.name,
                "Item": serialize_item(rules_item),
            }
        },
        {
            "Update": {
                "TableName": catalog.name,
                "Key": serialize_item(session_key(session_id)),
                "UpdateExpression": (
                    "SET version = :next_version, updated_at = :updated_at"
                ),
                "ConditionExpression": condition_expression,
                "ExpressionAttributeNames": {"#status": "status"},
                "ExpressionAttributeValues": serialize_values(expression_values),
            }
        },
    ]

    try:
        transaction_client(catalog).transact_write_items(TransactItems=transaction)
    except ClientError as error:
        if _is_conditional_failure(error):
            raise Conflict(
                "SESSION_CHANGED",
                "Session changed; reload and retry",
            ) from error
        raise

    return {"session_id": session_id, "version": next_version}


@app.post("/api/v1/auction-sessions")
def create_session() -> Response:
    identity = identity_from_event(app.current_event.raw_event)
    require_group(identity, "USER")
    body = CreateSessionRequest.model_validate(app.current_event.json_body)
    data = _create_session(
        identity,
        body,
        _catalog_table(),
        session_id=str(uuid.uuid4()),
        now=int(time.time()),
    )
    return _response(201, "SESSION_CREATED", "Session created", data)


@app.put("/api/v1/auction-sessions/<session_id>/rules")
def put_rules(session_id: str) -> Response:
    identity = identity_from_event(app.current_event.raw_event)
    require_group(identity, "USER")
    rules = ControlPlaneRules.model_validate(app.current_event.json_body)
    data = _put_rules(session_id, identity, rules, _catalog_table())
    return _response(
        200,
        "SESSION_RULES_UPDATED",
        "Session rules updated",
        data,
    )


@app.exception_handler(ServiceError)
def handle_service_error(error: ServiceError) -> Response:
    return _response(error.status_code, error.code, error.message)


@app.exception_handler(ValidationError)
def handle_validation_error(_error: ValidationError) -> Response:
    return _response(
        400,
        "VALIDATION_ERROR",
        "Request validation failed",
    )


@app.exception_handler(json.JSONDecodeError)
def handle_invalid_json(_error: json.JSONDecodeError) -> Response:
    return _response(
        400,
        "INVALID_JSON",
        "Request body must be valid JSON",
    )


@app.exception_handler(Exception)
def handle_unexpected_error(_error: Exception) -> Response:
    logger.exception("Unhandled session service error")
    return _response(500, "INTERNAL_ERROR", "Internal server error")


def handler(event, context):
    return app.resolve(event, context)
