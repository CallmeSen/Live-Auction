import base64
import binascii
import json
import re
from collections.abc import Mapping
from decimal import Decimal
from typing import Any

from boto3.dynamodb.types import TypeSerializer

from auction_common.http import BadRequest, NotFound


_SERIALIZER = TypeSerializer()
_INVALID_CURSOR_MESSAGE = "Cursor is invalid"
_SAFE_SEGMENT = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,127}\Z")
_PAGINATION_KEY_SCHEMAS = frozenset(
    {
        frozenset({"pk", "sk"}),
        frozenset({"pk", "sk", "gsi1pk", "gsi1sk"}),
        frozenset({"pk", "sk", "gsi2pk", "gsi2sk"}),
        frozenset({"item_id", "sk", "bidder_sub"}),
    }
)


def transaction_client(table):
    injected = getattr(table, "__dict__", {}).get("_transaction_client")
    if injected is None:
        raise RuntimeError("DynamoDB transaction client is not configured")
    return injected


def _catalog_sequence(value: Any) -> int:
    if type(value) is int:
        sequence = value
    elif isinstance(value, Decimal) and value.is_finite() and value == value.to_integral_value():
        sequence = int(value)
    else:
        raise RuntimeError("Catalog item has an invalid sequence")
    if not 1 <= sequence <= 999999:
        raise RuntimeError("Catalog item has an invalid sequence")
    return sequence


def session_key(session_id: str) -> dict[str, str]:
    return {"pk": f"SESSION#{session_id}", "sk": "META"}


def rules_key(session_id: str) -> dict[str, str]:
    return {"pk": f"SESSION#{session_id}", "sk": "RULES"}


def item_key(session_id: str, sequence: int, item_id: str) -> dict[str, str]:
    return {
        "pk": f"SESSION#{session_id}",
        "sk": f"ITEM#{sequence:06d}#{item_id}",
    }


def item_lookup_key(item_id: str) -> dict[str, str]:
    return {"pk": f"ITEM#{item_id}", "sk": "LOOKUP"}


def _lookup_base_key(lookup: Any, item_id: str) -> dict[str, str]:
    if not isinstance(lookup, Mapping):
        raise RuntimeError("Catalog item lookup is malformed")
    if lookup.get("entity_type") != "ITEM_LOOKUP":
        raise RuntimeError("Catalog item lookup has an invalid entity type")
    if lookup.get("pk") != item_lookup_key(item_id)["pk"]:
        raise RuntimeError("Catalog item lookup has an invalid partition key")
    if lookup.get("sk") != "LOOKUP" or lookup.get("item_id") != item_id:
        raise RuntimeError("Catalog item lookup has invalid item metadata")
    session_id = lookup.get("session_id")
    try:
        sequence = _catalog_sequence(lookup.get("sequence_number"))
    except RuntimeError as error:
        raise RuntimeError("Catalog item lookup has an invalid target") from error
    if (
        not isinstance(session_id, str)
        or _SAFE_SEGMENT.fullmatch(session_id) is None
    ):
        raise RuntimeError("Catalog item lookup has an invalid target")
    return item_key(session_id, sequence, item_id)


def _validate_base_item(
    item: Any,
    item_id: str,
    expected_key: dict[str, str],
) -> None:
    if not isinstance(item, Mapping):
        raise RuntimeError("Catalog item is malformed")
    if item.get("entity_type") != "ITEM" or item.get("item_id") != item_id:
        raise RuntimeError("Catalog item has invalid item metadata")
    session_id = item.get("session_id")
    try:
        sequence = _catalog_sequence(item.get("sequence_number"))
    except RuntimeError as error:
        raise RuntimeError("Catalog item has an invalid target") from error
    if (
        not isinstance(session_id, str)
        or _SAFE_SEGMENT.fullmatch(session_id) is None
    ):
        raise RuntimeError("Catalog item has an invalid target")
    if item_key(session_id, sequence, item_id) != expected_key:
        raise RuntimeError("Catalog item metadata does not match lookup")
    if item.get("pk") != expected_key["pk"] or item.get("sk") != expected_key["sk"]:
        raise RuntimeError("Catalog item key does not match item metadata")


def load_item_by_id(catalog, item_id: str) -> dict[str, Any]:
    if not isinstance(item_id, str) or _SAFE_SEGMENT.fullmatch(item_id) is None:
        raise BadRequest("INVALID_ITEM_ID", "Item identifier is invalid")

    lookup_response = catalog.get_item(
        Key=item_lookup_key(item_id),
        ConsistentRead=True,
    )
    lookup = lookup_response.get("Item")
    if lookup is None:
        raise NotFound("ITEM_NOT_FOUND", "Item was not found")
    base_key = _lookup_base_key(lookup, item_id)

    item_response = catalog.get_item(Key=base_key, ConsistentRead=True)
    item = item_response.get("Item")
    if item is None:
        raise NotFound("ITEM_NOT_FOUND", "Item was not found")
    _validate_base_item(item, item_id, base_key)
    return item


def item_order_key(session_id: str, sequence: int) -> dict[str, str]:
    return {"pk": f"SESSION#{session_id}", "sk": f"ITEM_ORDER#{sequence:06d}"}


def user_profile_key(user_sub: str) -> dict[str, str]:
    return {"pk": f"USER#{user_sub}", "sk": "PROFILE"}


def category_key(category_id: str) -> dict[str, str]:
    return {"pk": "CATALOG", "sk": f"CATEGORY#{category_id}"}


def serialize_item(value: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {key: _SERIALIZER.serialize(item) for key, item in value.items()}


def serialize_values(value: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {key: _SERIALIZER.serialize(item) for key, item in value.items()}


def _cursor_context(
    context: Mapping[str, str | None] | None,
    *,
    required: bool = False,
) -> dict[str, str | None] | None:
    if context is None:
        if required:
            raise BadRequest("INVALID_CURSOR", _INVALID_CURSOR_MESSAGE)
        return None
    if not isinstance(context, Mapping) or not all(
        isinstance(key, str) and (isinstance(value, str) or value is None)
        for key, value in context.items()
    ):
        raise BadRequest("INVALID_CURSOR", _INVALID_CURSOR_MESSAGE)
    return dict(context)


def encode_cursor(
    key: dict[str, str] | None,
    context: Mapping[str, str | None] | None = None,
) -> str | None:
    normalized_context = _cursor_context(context)
    if not key:
        return None
    payload_value: dict[str, Any] = {"v": 1, "k": key}
    if normalized_context is not None:
        payload_value = {"v": 2, "k": key, "q": normalized_context}
    payload = json.dumps(payload_value, separators=(",", ":"), sort_keys=True)
    return base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")


def decode_cursor(
    cursor: str | None,
    expected_context: Mapping[str, str | None] | None = None,
) -> dict[str, str] | None:
    normalized_expected_context = _cursor_context(expected_context)
    if cursor is None:
        return None
    try:
        if not isinstance(cursor, str) or not cursor:
            raise TypeError
        padding = "=" * (-len(cursor) % 4)
        encoded = (cursor + padding).encode("ascii")
        raw = base64.b64decode(encoded, altchars=b"-_", validate=True)
        payload = json.loads(raw.decode("utf-8"))
        if not isinstance(payload, dict):
            raise TypeError
        version = payload["v"]
        key = payload["k"]
        if type(version) is not int or not isinstance(key, dict):
            raise ValueError
        if version == 1:
            if frozenset(payload) != frozenset({"v", "k"}):
                raise ValueError
            context = None
        elif version == 2:
            if frozenset(payload) != frozenset({"v", "k", "q"}):
                raise ValueError
            context = _cursor_context(payload["q"], required=True)
        else:
            raise ValueError
        if frozenset(key) not in _PAGINATION_KEY_SCHEMAS or not all(
            isinstance(value, str) and bool(value.strip()) for value in key.values()
        ):
            raise ValueError
        if (
            expected_context is not None
            and context != normalized_expected_context
        ):
            raise ValueError
        return key
    except (
        binascii.Error,
        KeyError,
        TypeError,
        UnicodeError,
        ValueError,
        json.JSONDecodeError,
    ) as error:
        raise BadRequest("INVALID_CURSOR", _INVALID_CURSOR_MESSAGE) from error
