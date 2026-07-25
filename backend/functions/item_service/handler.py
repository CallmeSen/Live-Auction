from __future__ import annotations

import json
import re
import time
import uuid
from functools import lru_cache
from typing import Any

import boto3
from aws_lambda_powertools import Logger
from aws_lambda_powertools.event_handler import APIGatewayRestResolver, Response
from aws_lambda_powertools.event_handler.exceptions import (
    NotFoundError as ResolverNotFoundError,
)
from botocore.exceptions import ClientError
from pydantic import ValidationError

from auction_common.catalog import (
    item_key,
    item_lookup_key,
    item_order_key,
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
from auction_common.models import CreateItemRequest, PresignImageRequest


app = APIGatewayRestResolver()
logger = Logger(service="item-service")

_IMAGE_EXTENSIONS = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}
_MAX_IMAGES = 5
_HARD_MAX_MEDIA_BYTES = 5 * 1024 * 1024
_SAFE_SEGMENT = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,127}\Z")


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
def _s3_client():
    return boto3.client("s3")


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


def _path_segment(value: Any, code: str, message: str) -> str:
    if not isinstance(value, str) or _SAFE_SEGMENT.fullmatch(value) is None:
        raise BadRequest(code, message)
    return value


def _transaction_failure_positions(error: ClientError) -> frozenset[int] | None:
    if _client_error_code(error) != "TransactionCanceledException":
        return None
    reasons = error.response.get("CancellationReasons")
    if not isinstance(reasons, list) or len(reasons) != 5:
        return None
    conditional_positions = []
    for position, reason in enumerate(reasons):
        if not isinstance(reason, dict):
            return None
        code = reason.get("Code")
        if code == "ConditionalCheckFailed":
            conditional_positions.append(position)
        elif code not in (None, "None"):
            return None
    if not conditional_positions:
        return None
    return frozenset(conditional_positions)


def _create_item(
    identity: RequestIdentity,
    session_id: str,
    body: CreateItemRequest,
    catalog,
    item_id: str,
    now: int,
) -> dict[str, Any]:
    require_group(identity, "SELLER")
    response = catalog.get_item(
        Key=session_key(session_id),
        ConsistentRead=True,
    )
    session = response.get("Item")
    if session is None:
        raise NotFound("SESSION_NOT_FOUND", "Session was not found")

    is_admin = "ADMIN" in identity.groups
    seller_sub = session.get("seller_sub")
    if not is_admin and seller_sub != identity.sub:
        raise Forbidden()
    if session.get("status") != "DRAFT":
        raise Conflict("SESSION_NOT_DRAFT", "Session is not in draft status")

    rules_response = catalog.get_item(
        Key=rules_key(session_id),
        ConsistentRead=True,
    )
    if rules_response.get("Item") is None:
        raise BadRequest("RULES_REQUIRED", "Session rules are required")

    item = {
        **item_key(session_id, body.sequence_number, item_id),
        "entity_type": "ITEM",
        "item_id": item_id,
        "session_id": session_id,
        "sequence_number": body.sequence_number,
        "name": body.name,
        "description": body.description,
        "category_id": body.category_id,
        "start_price": body.start_price,
        "duration_s": body.duration_s,
        "status": "WAITING",
        "seller_sub": seller_sub,
        "image_keys": [],
        "version": 1,
        "created_at": now,
        "updated_at": now,
        "gsi1pk": f"ITEM#{item_id}",
        "gsi1sk": "META",
        "gsi2pk": "ITEM",
        "gsi2sk": f"STATUS#WAITING#CREATED#{now:010d}#{item_id}",
    }
    order = {
        **item_order_key(session_id, body.sequence_number),
        "entity_type": "ITEM_ORDER",
        "item_id": item_id,
        "session_id": session_id,
        "sequence_number": body.sequence_number,
    }
    lookup = {
        **item_lookup_key(item_id),
        "entity_type": "ITEM_LOOKUP",
        "item_id": item_id,
        "session_id": session_id,
        "sequence_number": body.sequence_number,
    }
    expected_version = int(session["version"])
    condition_expression = (
        "#status = :draft AND version = :expected "
        "AND seller_sub = :session_seller"
    )
    expression_values = {
        ":one": 1,
        ":now": now,
        ":draft": "DRAFT",
        ":expected": expected_version,
        ":session_seller": seller_sub,
    }

    transaction = [
        {
            "ConditionCheck": {
                "TableName": catalog.name,
                "Key": serialize_item(rules_key(session_id)),
                "ConditionExpression": "attribute_exists(pk)",
            }
        },
        {
            "Put": {
                "TableName": catalog.name,
                "Item": serialize_item(order),
                "ConditionExpression": "attribute_not_exists(pk)",
            }
        },
        {
            "Put": {
                "TableName": catalog.name,
                "Item": serialize_item(lookup),
                "ConditionExpression": "attribute_not_exists(pk)",
            }
        },
        {
            "Put": {
                "TableName": catalog.name,
                "Item": serialize_item(item),
                "ConditionExpression": "attribute_not_exists(pk)",
            }
        },
        {
            "Update": {
                "TableName": catalog.name,
                "Key": serialize_item(session_key(session_id)),
                "UpdateExpression": (
                    "SET item_count = item_count + :one, "
                    "version = version + :one, updated_at = :now"
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
        failure_positions = _transaction_failure_positions(error)
        if failure_positions is None:
            raise
        if 1 in failure_positions:
            raise Conflict(
                "ITEM_ORDER_CONFLICT",
                "Item sequence already exists",
            ) from error
        if failure_positions.intersection((2, 3)):
            raise Conflict(
                "ITEM_ID_CONFLICT",
                "Item identifier already exists",
            ) from error
        if 0 in failure_positions:
            raise BadRequest(
                "RULES_REQUIRED",
                "Session rules are required",
            ) from error
        if 4 in failure_positions:
            raise Conflict(
                "SESSION_CHANGED",
                "Session changed; reload and retry",
            ) from error
        raise

    return {"item_id": item_id, "status": "WAITING", "version": 1}


def _find_item(catalog, item_id: str) -> dict[str, Any]:
    return load_item_by_id(catalog, item_id)


def _item_update_key(item: dict[str, Any], item_id: str) -> dict[str, str]:
    if item.get("entity_type") != "ITEM" or item.get("item_id") != item_id:
        raise RuntimeError("Catalog item has invalid item metadata")
    session_id = item.get("session_id")
    sequence = item.get("sequence_number")
    if not isinstance(session_id, str) or not session_id:
        raise RuntimeError("Catalog item is missing its session identifier")
    if type(sequence) is not int or not 1 <= sequence <= 999999:
        raise RuntimeError("Catalog item has an invalid sequence")
    expected_key = item_key(session_id, sequence, item_id)
    if item.get("pk") != expected_key["pk"] or item.get("sk") != expected_key["sk"]:
        raise RuntimeError("Catalog item key does not match item metadata")
    return expected_key


def _image_keys(item: dict[str, Any]) -> list[str]:
    image_keys = item.get("image_keys", [])
    if not isinstance(image_keys, list) or not all(
        isinstance(value, str) for value in image_keys
    ):
        raise RuntimeError("Catalog item has invalid image metadata")
    return image_keys


def _presign_image(
    identity: RequestIdentity,
    item: dict[str, Any],
    body: PresignImageRequest,
    catalog,
    s3,
    bucket: str,
    object_id: str,
    max_bytes: int,
) -> dict[str, Any]:
    require_group(identity, "SELLER")
    seller_sub = _path_segment(
        item.get("seller_sub"),
        "INVALID_MEDIA_PATH",
        "Media path is invalid",
    )
    item_id = _path_segment(
        item.get("item_id"),
        "INVALID_ITEM_ID",
        "Item identifier is invalid",
    )
    normalized_object_id = _path_segment(
        object_id,
        "INVALID_OBJECT_ID",
        "Object identifier is invalid",
    )
    if "ADMIN" not in identity.groups and seller_sub != identity.sub:
        raise Forbidden()
    if item.get("status") != "WAITING":
        raise Conflict("ITEM_NOT_WAITING", "Item is not waiting")
    if type(max_bytes) is not int or max_bytes < 1:
        raise RuntimeError("MAX_MEDIA_BYTES must be a positive integer")
    effective_max_bytes = min(max_bytes, _HARD_MAX_MEDIA_BYTES)
    if body.size_bytes > effective_max_bytes:
        raise BadRequest("IMAGE_TOO_LARGE", "Image exceeds the size limit")

    image_keys = _image_keys(item)
    if len(image_keys) >= _MAX_IMAGES:
        raise Conflict("IMAGE_LIMIT_REACHED", "Item image limit was reached")
    version = item.get("version")
    if type(version) is not int:
        raise RuntimeError("Catalog item has an invalid version")
    update_key = _item_update_key(item, item_id)

    extension = _IMAGE_EXTENSIONS[body.content_type]
    object_key = (
        f"items/{seller_sub}/{item_id}/{normalized_object_id}.{extension}"
    )
    signed = s3.generate_presigned_post(
        Bucket=bucket,
        Key=object_key,
        Fields={"Content-Type": body.content_type},
        Conditions=[
            {"Content-Type": body.content_type},
            ["content-length-range", 1, effective_max_bytes],
        ],
        ExpiresIn=300,
    )

    try:
        catalog.update_item(
            Key=update_key,
            UpdateExpression=(
                "SET image_keys = list_append(if_not_exists(image_keys, :empty), "
                ":object_keys), version = version + :one, updated_at = :now"
            ),
            ConditionExpression=(
                "seller_sub = :seller AND #status = :waiting "
                "AND version = :expected AND "
                "(attribute_not_exists(image_keys) OR "
                "size(image_keys) < :max_images)"
            ),
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={
                ":empty": [],
                ":object_keys": [object_key],
                ":one": 1,
                ":now": int(time.time()),
                ":seller": seller_sub,
                ":waiting": "WAITING",
                ":expected": version,
                ":max_images": _MAX_IMAGES,
            },
        )
    except ClientError as error:
        if _client_error_code(error) != "ConditionalCheckFailedException":
            raise
        try:
            current_item = _find_item(catalog, item_id)
        except NotFound:
            raise Conflict(
                "IMAGE_CHANGED",
                "Item changed; reload and retry",
            ) from error
        if len(_image_keys(current_item)) >= _MAX_IMAGES:
            raise Conflict(
                "IMAGE_LIMIT_REACHED",
                "Item image limit was reached",
            ) from error
        raise Conflict(
            "IMAGE_CHANGED",
            "Item changed; reload and retry",
        ) from error

    return {
        "url": signed["url"],
        "fields": signed["fields"],
        "object_key": object_key,
        "expires_in": 300,
    }


@app.post("/api/v1/auction-sessions/<session_id>/items")
def create_item(session_id: str) -> Response:
    identity = identity_from_event(app.current_event.raw_event)
    body = CreateItemRequest.model_validate(app.current_event.json_body)
    data = _create_item(
        identity,
        session_id,
        body,
        _catalog_table(),
        item_id=str(uuid.uuid4()),
        now=int(time.time()),
    )
    return _response(201, "ITEM_CREATED", "Item created", data)


@app.post("/api/v1/auction-items/<item_id>/images/presign")
def presign_image(item_id: str) -> Response:
    identity = identity_from_event(app.current_event.raw_event)
    require_group(identity, "SELLER")
    body = PresignImageRequest.model_validate(app.current_event.json_body)
    catalog = _catalog_table()
    item = _find_item(catalog, item_id)
    config = get_config()
    data = _presign_image(
        identity,
        item,
        body,
        catalog,
        _s3_client(),
        bucket=config.MEDIA_BUCKET,
        object_id=str(uuid.uuid4()),
        max_bytes=config.MAX_MEDIA_BYTES,
    )
    return _response(
        200,
        "IMAGE_UPLOAD_PRESIGNED",
        "Image upload authorized",
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


@app.exception_handler(ResolverNotFoundError)
def handle_route_not_found(_error: ResolverNotFoundError) -> Response:
    return _response(404, "ROUTE_NOT_FOUND", "Route was not found")


@app.exception_handler(Exception)
def handle_unexpected_error(_error: Exception) -> Response:
    logger.exception("Unhandled item service error")
    return _response(500, "INTERNAL_ERROR", "Internal server error")


def handler(event, context):
    return app.resolve(event, context)
