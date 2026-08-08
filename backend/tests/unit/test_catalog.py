import base64
import json
from decimal import Decimal

import pytest

import auction_common.catalog as catalog_api
from auction_common.catalog import (
    category_key,
    decode_cursor,
    encode_cursor,
    item_key,
    item_lookup_key,
    item_order_key,
    rules_key,
    serialize_item,
    serialize_values,
    session_key,
    user_profile_key,
)
from auction_common.http import BadRequest, NotFound


class FakeCatalog:
    def __init__(self, responses=None):
        self.responses = list(responses or [])
        self.get_calls = []
        self.query_calls = []
        self.scan_calls = []

    def get_item(self, **kwargs):
        self.get_calls.append(kwargs)
        if self.responses:
            return self.responses.pop(0)
        return {}

    def query(self, **kwargs):
        self.query_calls.append(kwargs)
        raise AssertionError("item lookup must not query")

    def scan(self, **kwargs):
        self.scan_calls.append(kwargs)
        raise AssertionError("item lookup must not scan")


def lookup_record(**overrides):
    value = {
        **item_lookup_key("i1"),
        "entity_type": "ITEM_LOOKUP",
        "item_id": "i1",
        "session_id": "s1",
        "sequence_number": 3,
    }
    value.update(overrides)
    return value


def base_item(**overrides):
    value = {
        **item_key("s1", 3, "i1"),
        "entity_type": "ITEM",
        "item_id": "i1",
        "session_id": "s1",
        "sequence_number": 3,
        "status": "WAITING",
    }
    value.update(overrides)
    return value


def encoded_payload(payload) -> str:
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def test_catalog_keys_are_deterministic():
    assert session_key("s1") == {"pk": "SESSION#s1", "sk": "META"}
    assert rules_key("s1") == {"pk": "SESSION#s1", "sk": "RULES"}
    assert item_key("s1", 2, "i1") == {
        "pk": "SESSION#s1",
        "sk": "ITEM#000002#i1",
    }
    assert item_order_key("s1", 2) == {
        "pk": "SESSION#s1",
        "sk": "ITEM_ORDER#000002",
    }
    assert item_lookup_key("i1") == {"pk": "ITEM#i1", "sk": "LOOKUP"}
    assert user_profile_key("u1") == {"pk": "USER#u1", "sk": "PROFILE"}
    assert category_key("c1") == {"pk": "CATALOG", "sk": "CATEGORY#c1"}


def test_dynamodb_serializers_preserve_item_and_expression_value_names():
    assert serialize_item(
        {"pk": "SESSION#s1", "version": 1, "price": Decimal("10.25")}
    ) == {
        "pk": {"S": "SESSION#s1"},
        "version": {"N": "1"},
        "price": {"N": "10.25"},
    }
    assert serialize_values({":seller": "u1", ":one": 1}) == {
        ":seller": {"S": "u1"},
        ":one": {"N": "1"},
    }


def test_transaction_client_requires_an_explicit_low_level_client():
    with pytest.raises(RuntimeError, match="not configured"):
        catalog_api.transaction_client(object())


def test_transaction_client_accepts_an_explicit_test_double():
    injected = object()
    table = type("TableDouble", (), {})()
    table._transaction_client = injected

    assert catalog_api.transaction_client(table) is injected


def test_load_item_by_id_strongly_reads_lookup_then_validated_base_item():
    expected = base_item()
    catalog = FakeCatalog(
        [
            {"Item": lookup_record()},
            {"Item": expected},
        ]
    )

    result = catalog_api.load_item_by_id(catalog, "i1")

    assert result is expected
    assert catalog.get_calls == [
        {"Key": item_lookup_key("i1"), "ConsistentRead": True},
        {"Key": item_key("s1", 3, "i1"), "ConsistentRead": True},
    ]
    assert catalog.query_calls == []
    assert catalog.scan_calls == []


@pytest.mark.parametrize(
    ("responses", "expected_reads"),
    [
        ([], 1),
        ([{"Item": lookup_record()}], 2),
    ],
    ids=("missing-lookup", "missing-base-item"),
)
def test_load_item_by_id_maps_missing_records_to_not_found(
    responses, expected_reads
):
    catalog = FakeCatalog(responses)

    with pytest.raises(NotFound) as caught:
        catalog_api.load_item_by_id(catalog, "i1")

    assert caught.value.code == "ITEM_NOT_FOUND"
    assert caught.value.message == "Item was not found"
    assert len(catalog.get_calls) == expected_reads


@pytest.mark.parametrize(
    "lookup",
    [
        lookup_record(entity_type="ITEM"),
        lookup_record(pk="ITEM#other"),
        lookup_record(sk="META"),
        lookup_record(item_id="other"),
        lookup_record(session_id=""),
        lookup_record(session_id="../s1"),
        lookup_record(sequence_number=True),
        lookup_record(sequence_number=0),
        lookup_record(sequence_number=1_000_000),
    ],
)
def test_load_item_by_id_rejects_malformed_lookup_record(lookup):
    catalog = FakeCatalog([{"Item": lookup}])

    with pytest.raises(RuntimeError):
        catalog_api.load_item_by_id(catalog, "i1")

    assert len(catalog.get_calls) == 1


@pytest.mark.parametrize(
    "item",
    [
        base_item(entity_type="ITEM_LOOKUP"),
        base_item(item_id="other"),
        base_item(session_id="other"),
        base_item(sequence_number=4),
        base_item(pk="SESSION#other"),
        base_item(sk="ITEM#000004#i1"),
    ],
)
def test_load_item_by_id_rejects_malformed_base_item(item):
    catalog = FakeCatalog(
        [
            {"Item": lookup_record()},
            {"Item": item},
        ]
    )

    with pytest.raises(RuntimeError):
        catalog_api.load_item_by_id(catalog, "i1")

    assert len(catalog.get_calls) == 2


@pytest.mark.parametrize(
    "unsafe_id",
    ["../i1", "a/b", "a\\b", ".", "..", "bad\nvalue", "x" * 129],
)
def test_load_item_by_id_rejects_unsafe_item_identifier(unsafe_id):
    catalog = FakeCatalog()

    with pytest.raises(BadRequest) as caught:
        catalog_api.load_item_by_id(catalog, unsafe_id)

    assert caught.value.code == "INVALID_ITEM_ID"
    assert caught.value.message == "Item identifier is invalid"
    assert catalog.get_calls == []


def test_none_cursor_round_trips_as_none():
    assert encode_cursor(None) is None
    assert decode_cursor(None) is None


def test_cursor_is_deterministic_versioned_compact_urlsafe_json():
    key = {"sk": "META", "pk": "SESSION#s1"}

    cursor = encode_cursor(key)
    decoded_payload = base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4))

    assert cursor == encode_cursor({"pk": "SESSION#s1", "sk": "META"})
    assert "=" not in cursor
    assert decoded_payload == b'{"k":{"pk":"SESSION#s1","sk":"META"},"v":1}'
    assert decode_cursor(cursor) == key


def test_context_cursor_is_deterministic_v2_and_round_trips_exact_context():
    key = {"pk": "SESSION#s1", "sk": "META"}
    context = {"status": None, "kind": "sessions"}

    cursor = encode_cursor(key, context)
    decoded_payload = base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4))

    assert decoded_payload == (
        b'{"k":{"pk":"SESSION#s1","sk":"META"},'
        b'"q":{"kind":"sessions","status":null},"v":2}'
    )
    assert decode_cursor(cursor, {"kind": "sessions", "status": None}) == key
    assert decode_cursor(cursor) == key


@pytest.mark.parametrize(
    "expected_context",
    [
        {"kind": "sessions", "status": "LIVE"},
        {"kind": "items", "status": None},
        {"kind": "sessions"},
    ],
)
def test_context_cursor_rejects_cross_query_reuse(expected_context):
    cursor = encode_cursor(
        {"pk": "SESSION#s1", "sk": "META"},
        {"kind": "sessions", "status": None},
    )

    with pytest.raises(BadRequest) as caught:
        decode_cursor(cursor, expected_context)

    assert caught.value.code == "INVALID_CURSOR"


def test_expected_context_rejects_legacy_v1_cursor():
    cursor = encode_cursor({"pk": "SESSION#s1", "sk": "META"})

    with pytest.raises(BadRequest) as caught:
        decode_cursor(cursor, {"kind": "sessions", "status": None})

    assert caught.value.code == "INVALID_CURSOR"


@pytest.mark.parametrize(
    "context",
    [
        [],
        {1: "sessions"},
        {"kind": 1},
        {"kind": []},
    ],
)
def test_encode_cursor_rejects_malformed_context(context):
    with pytest.raises(BadRequest) as caught:
        encode_cursor({"pk": "SESSION#s1", "sk": "META"}, context)

    assert caught.value.code == "INVALID_CURSOR"


@pytest.mark.parametrize(
    "payload",
    [
        {"v": 2, "k": {"pk": "SESSION#s1", "sk": "META"}},
        {
            "v": 2,
            "k": {"pk": "SESSION#s1", "sk": "META"},
            "q": [],
        },
        {
            "v": 2,
            "k": {"pk": "SESSION#s1", "sk": "META"},
            "q": {"kind": 1},
        },
    ],
)
def test_decode_cursor_rejects_malformed_v2_context(payload):
    with pytest.raises(BadRequest) as caught:
        decode_cursor(encoded_payload(payload))

    assert caught.value.code == "INVALID_CURSOR"


def test_decode_cursor_rejects_malformed_expected_context():
    cursor = encode_cursor(
        {"pk": "SESSION#s1", "sk": "META"},
        {"kind": "sessions"},
    )

    with pytest.raises(BadRequest) as caught:
        decode_cursor(cursor, {"kind": 1})

    assert caught.value.code == "INVALID_CURSOR"


@pytest.mark.parametrize(
    "key",
    [
        {
            "pk": "SESSION#s1",
            "sk": "META",
            "gsi1pk": "STATUS#LIVE",
            "gsi1sk": "START#1",
        },
        {
            "pk": "SESSION#s1",
            "sk": "ITEM#000001#i1",
            "gsi2pk": "ITEM",
            "gsi2sk": "STATUS#LIVE",
        },
        {"item_id": "i1", "sk": "TS#1", "bidder_sub": "bidder-1"},
    ],
)
def test_cursor_round_trips_supported_index_key_schemas(key):
    assert decode_cursor(encode_cursor(key)) == key


@pytest.mark.parametrize(
    "key",
    [
        {},
        {"x": "y"},
        {"pk": "x"},
        {"item_id": "i1"},
        {"pk": "x", "item_id": "y"},
        {"pk": ""},
        {"pk": "   "},
    ],
)
def test_decode_cursor_rejects_empty_unknown_or_blank_pagination_keys(key):
    cursor = encoded_payload({"v": 1, "k": key})

    with pytest.raises(BadRequest) as exc_info:
        decode_cursor(cursor)

    assert exc_info.value.code == "INVALID_CURSOR"
    assert exc_info.value.message == "Cursor is invalid"


@pytest.mark.parametrize(
    "cursor",
    [
        "",
        "%%%",
        base64.urlsafe_b64encode(b"\xff").decode().rstrip("="),
        base64.urlsafe_b64encode(b"{").decode().rstrip("="),
        encoded_payload([]),
        encoded_payload({"v": 1}),
        encoded_payload({"v": 2, "k": {"pk": "SESSION#s1"}}),
        encoded_payload({"v": "1", "k": {"pk": "SESSION#s1"}}),
        encoded_payload({"v": True, "k": {"pk": "SESSION#s1"}}),
        encoded_payload({"v": 1, "k": ["SESSION#s1"]}),
        encoded_payload({"v": 1, "k": {"pk": 1}}),
        123,
    ],
)
def test_decode_cursor_rejects_malformed_versions_types_and_values(cursor):
    with pytest.raises(BadRequest) as exc_info:
        decode_cursor(cursor)

    assert exc_info.value.status_code == 400
    assert exc_info.value.code == "INVALID_CURSOR"
    assert exc_info.value.message == "Cursor is invalid"
