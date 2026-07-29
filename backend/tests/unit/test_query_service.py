import json
from decimal import Decimal

import pytest

from auction_common.catalog import (
    encode_cursor,
    item_key,
    item_lookup_key,
    session_key,
)
from auction_common.http import (
    BadRequest,
    Conflict,
    Forbidden,
    NotFound,
    RequestIdentity,
)
from functions.query_service import handler as service


class FakeTable:
    def __init__(self, query_responses=None, get_responses=None):
        self.query_responses = list(query_responses or [])
        self.get_responses = list(get_responses or [])
        self.query_calls = []
        self.get_calls = []
        self.scan_calls = []

    def query(self, **kwargs):
        self.query_calls.append(kwargs)
        if self.query_responses:
            return self.query_responses.pop(0)
        return {"Items": []}

    def get_item(self, **kwargs):
        self.get_calls.append(kwargs)
        if self.get_responses:
            return self.get_responses.pop(0)
        return {}

    def scan(self, **kwargs):
        self.scan_calls.append(kwargs)
        raise AssertionError("query service must never scan")


def identity(sub="trusted-sub", *groups):
    return RequestIdentity(
        sub=sub,
        groups=frozenset(groups or ("SELLER",)),
    )


def session_record(**overrides):
    value = {
        "pk": "SESSION#s1",
        "sk": "META",
        "entity_type": "SESSION",
        "session_id": "s1",
        "seller_sub": "seller-sub",
        "title": "Evening sale",
        "description": "Prints and books",
        "status": "LIVE",
        "version": 7,
        "item_count": 2,
        "active_item_id": "i2",
        "current_sequence": 2,
        "owner_region": "ap-southeast-1",
        "created_at": 1_700_000_000,
        "updated_at": 1_700_000_100,
        "gsi1pk": "SELLER#seller-sub",
        "gsi1sk": "SESSION#1700000000#s1",
        "gsi2pk": "SESSION",
        "gsi2sk": "STATUS#LIVE#START#1700000200#s1",
        "internal_note": "private",
    }
    value.update(overrides)
    return value


def rules_record(**overrides):
    value = {
        "pk": "SESSION#s1",
        "sk": "RULES",
        "entity_type": "SESSION_RULES",
        "session_id": "s1",
        "version": 7,
        "min_increment": Decimal("5.00"),
        "max_increment": Decimal("500.00"),
        "anti_snipe_window_s": 30,
        "anti_snipe_extend_s": 60,
        "max_extensions": 10,
        "public_history_limit": 20,
        "updated_at": 1_700_000_100,
    }
    value.update(overrides)
    return value


def item_record(item_id="i1", sequence=1, **overrides):
    value = {
        **item_key("s1", sequence, item_id),
        "entity_type": "ITEM",
        "item_id": item_id,
        "session_id": "s1",
        "sequence_number": sequence,
        "name": f"Lot {sequence}",
        "description": "Signed print",
        "category_id": "prints",
        "start_price": Decimal("100.00"),
        "duration_s": 90,
        "status": "WAITING",
        "seller_sub": "seller-sub",
        "image_keys": [f"items/seller-sub/{item_id}/one.jpg"],
        "version": 3,
        "created_at": 1_700_000_000,
        "updated_at": 1_700_000_100,
        "gsi1pk": f"ITEM#{item_id}",
        "gsi1sk": "META",
        "gsi2pk": "ITEM",
        "gsi2sk": f"STATUS#WAITING#CREATED#1700000000#{item_id}",
        "internal_note": "private",
    }
    value.update(overrides)
    return value


def lookup_record(**overrides):
    value = {
        **item_lookup_key("i1"),
        "entity_type": "ITEM_LOOKUP",
        "item_id": "i1",
        "session_id": "s1",
        "sequence_number": 1,
    }
    value.update(overrides)
    return value


def rest_event(method, path, query=None, sub=None, groups=None, body=None):
    request_context = {}
    if sub is not None:
        request_context = {
            "authorizer": {
                "claims": {
                    "sub": sub,
                    "cognito:groups": groups,
                }
            }
        }
    return {
        "httpMethod": method,
        "path": path,
        "headers": {"Content-Type": "application/json"},
        "multiValueHeaders": {},
        "queryStringParameters": query,
        "multiValueQueryStringParameters": None,
        "pathParameters": None,
        "stageVariables": None,
        "requestContext": request_context,
        "body": body,
        "isBase64Encoded": False,
    }


def response_body(response):
    return json.loads(response["body"])


def assert_cors_headers(response):
    headers = {
        name: values[-1]
        for name, values in response["multiValueHeaders"].items()
    }
    assert headers == {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "https://auction.example.com",
        "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Api-Key",
        "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    }


def sessions_context(status):
    return {"kind": "sessions", "status": status}


def mine_context(sub):
    return {"kind": "mine", "sub": sub}


def items_context(status, session_id=None, category_id=None):
    return {
        "kind": "items",
        "status": status,
        "session_id": session_id,
        "category_id": category_id,
    }


def bids_context(sub):
    return {"kind": "bids", "sub": sub}


def test_list_sessions_queries_gsi2_descending_and_encodes_cursor():
    last_key = {
        "pk": "SESSION#s1",
        "sk": "META",
        "gsi2pk": "SESSION",
        "gsi2sk": "STATUS#LIVE#START#1700000200#s1",
    }
    catalog = FakeTable(
        query_responses=[
            {
                "Items": [session_record()],
                "LastEvaluatedKey": last_key,
            }
        ]
    )

    result = service._list_sessions(
        catalog,
        status="LIVE",
        page_size=25,
        cursor=None,
    )

    assert catalog.query_calls == [
        {
            "IndexName": "gsi2",
            "KeyConditionExpression": (
                "gsi2pk = :pk AND begins_with(gsi2sk, :prefix)"
            ),
            "ExpressionAttributeValues": {
                ":pk": "SESSION",
                ":prefix": "STATUS#LIVE#",
            },
            "Limit": 25,
            "ScanIndexForward": False,
        }
    ]
    assert result == {
        "items": [
            {
                "session_id": "s1",
                "title": "Evening sale",
                "description": "Prints and books",
                "status": "LIVE",
                "item_count": 2,
                "active_item_id": "i2",
                "current_sequence": 2,
                "created_at": 1_700_000_000,
                "updated_at": 1_700_000_100,
            }
        ],
        "next_cursor": encode_cursor(last_key, sessions_context("LIVE")),
    }
    assert "LastEvaluatedKey" not in result
    assert catalog.scan_calls == []


def test_list_sessions_uses_all_status_prefix_and_decoded_start_key():
    start_key = {
        "pk": "SESSION#s1",
        "sk": "META",
        "gsi2pk": "SESSION",
        "gsi2sk": "STATUS#LIVE#START#0000000000#s1",
    }
    catalog = FakeTable()

    result = service._list_sessions(
        catalog,
        status=None,
        page_size=100,
        cursor=encode_cursor(start_key, sessions_context(None)),
    )

    assert catalog.query_calls[0]["ExpressionAttributeValues"] == {
        ":pk": "SESSION",
        ":prefix": "STATUS#",
        ":private_status": "DRAFT",
    }
    assert catalog.query_calls[0]["ExpressionAttributeNames"] == {
        "#status": "status"
    }
    assert catalog.query_calls[0]["FilterExpression"] == (
        "#status <> :private_status"
    )
    assert catalog.query_calls[0]["ExclusiveStartKey"] == start_key
    assert result == {"items": [], "next_cursor": None}


@pytest.mark.parametrize(
    "status",
    ["DRAFT", "draft", "PENDING", "", "SOLD", 1],
)
def test_list_sessions_rejects_private_or_unknown_status(status):
    catalog = FakeTable()

    with pytest.raises(BadRequest) as caught:
        service._list_sessions(catalog, status, page_size=20, cursor=None)

    assert caught.value.code == "INVALID_QUERY"
    assert catalog.query_calls == []


@pytest.mark.parametrize(
    "status",
    ["SCHEDULED", "LIVE", "COMPLETED", "CANCELLED"],
)
def test_list_sessions_keeps_every_public_status_queryable(status):
    catalog = FakeTable()

    service._list_sessions(catalog, status, page_size=20, cursor=None)

    assert catalog.query_calls[0]["ExpressionAttributeValues"] == {
        ":pk": "SESSION",
        ":prefix": f"STATUS#{status}#",
    }
    assert "FilterExpression" not in catalog.query_calls[0]


@pytest.mark.parametrize("page_size", [0, 101, True, "20"])
def test_list_sessions_rejects_page_size_outside_integer_bounds(page_size):
    catalog = FakeTable()

    with pytest.raises(BadRequest) as caught:
        service._list_sessions(catalog, "LIVE", page_size, None)

    assert caught.value.code == "INVALID_QUERY"
    assert catalog.query_calls == []


def test_list_sessions_rejects_cursor_for_another_index():
    cursor = encode_cursor(
        {
            "pk": "SESSION#s1",
            "sk": "META",
            "gsi1pk": "SELLER#seller-sub",
            "gsi1sk": "SESSION#1700000000#s1",
        },
        sessions_context("LIVE"),
    )

    with pytest.raises(BadRequest) as caught:
        service._list_sessions(FakeTable(), "LIVE", 20, cursor)

    assert caught.value.code == "INVALID_CURSOR"


def test_list_sessions_rejects_cursor_from_another_status_context():
    cursor = encode_cursor(
        {
            "pk": "SESSION#s1",
            "sk": "META",
            "gsi2pk": "SESSION",
            "gsi2sk": "STATUS#LIVE#START#1700000200#s1",
        },
        sessions_context("LIVE"),
    )

    with pytest.raises(BadRequest) as caught:
        service._list_sessions(FakeTable(), "COMPLETED", 20, cursor)

    assert caught.value.code == "INVALID_CURSOR"


def test_list_mine_uses_trusted_seller_partition_and_seller_projection():
    last_key = {
        "pk": "SESSION#s1",
        "sk": "META",
        "gsi1pk": "SELLER#trusted-sub",
        "gsi1sk": "SESSION#1700000000#s1",
    }
    catalog = FakeTable(
        query_responses=[
            {
                "Items": [
                    session_record(
                        seller_sub="trusted-sub",
                        gsi1pk="SELLER#trusted-sub",
                    )
                ],
                "LastEvaluatedKey": last_key,
            }
        ]
    )

    result = service._list_mine(
        catalog,
        identity("trusted-sub", "SELLER"),
        page_size=10,
        cursor=None,
    )

    assert catalog.query_calls == [
        {
            "IndexName": "gsi1",
            "KeyConditionExpression": (
                "gsi1pk = :pk AND begins_with(gsi1sk, :prefix)"
            ),
            "ExpressionAttributeValues": {
                ":pk": "SELLER#trusted-sub",
                ":prefix": "SESSION#",
            },
            "Limit": 10,
            "ScanIndexForward": False,
        }
    ]
    assert result["items"][0]["seller_sub"] == "trusted-sub"
    assert result["items"][0]["version"] == 7
    assert "pk" not in result["items"][0]
    assert "owner_region" not in result["items"][0]
    assert result["next_cursor"] == encode_cursor(
        last_key,
        mine_context("trusted-sub"),
    )
    assert catalog.scan_calls == []


def test_list_mine_allows_admin_override_and_rejects_other_roles():
    service._list_mine(
        FakeTable(),
        identity("admin-sub", "ADMIN"),
        page_size=20,
        cursor=None,
    )

    with pytest.raises(Forbidden):
        service._list_mine(
            FakeTable(),
            identity("bidder-sub", "BIDDER"),
            page_size=20,
            cursor=None,
        )


def test_list_mine_rejects_cursor_from_another_seller_partition():
    cursor = encode_cursor(
        {
            "pk": "SESSION#s1",
            "sk": "META",
            "gsi1pk": "SELLER#other-sub",
            "gsi1sk": "SESSION#1700000000#s1",
        },
        mine_context("other-sub"),
    )

    with pytest.raises(BadRequest) as caught:
        service._list_mine(
            FakeTable(), identity("trusted-sub", "SELLER"), 20, cursor
        )

    assert caught.value.code == "INVALID_CURSOR"


def test_get_session_strongly_reads_meta_rules_and_consumes_item_pages():
    first_page_key = {
        "pk": "SESSION#s1",
        "sk": "ITEM#000002#i2",
    }
    catalog = FakeTable(
        get_responses=[
            {"Item": session_record()},
            {"Item": rules_record()},
        ],
        query_responses=[
            {
                "Items": [item_record("i2", 2)],
                "LastEvaluatedKey": first_page_key,
            },
            {"Items": [item_record("i1", 1)]},
        ],
    )

    result = service._get_session(
        catalog,
        FakeTable(),
        identity("bidder-sub", "BIDDER"),
        "s1",
    )

    assert catalog.get_calls == [
        {"Key": {"pk": "SESSION#s1", "sk": "META"}, "ConsistentRead": True},
        {"Key": {"pk": "SESSION#s1", "sk": "RULES"}, "ConsistentRead": True},
    ]
    assert catalog.query_calls == [
        {
            "KeyConditionExpression": (
                "pk = :pk AND begins_with(sk, :item_prefix)"
            ),
            "ExpressionAttributeValues": {
                ":pk": "SESSION#s1",
                ":item_prefix": "ITEM#",
            },
            "ConsistentRead": True,
        },
        {
            "KeyConditionExpression": (
                "pk = :pk AND begins_with(sk, :item_prefix)"
            ),
            "ExpressionAttributeValues": {
                ":pk": "SESSION#s1",
                ":item_prefix": "ITEM#",
            },
            "ConsistentRead": True,
            "ExclusiveStartKey": first_page_key,
        },
    ]
    assert result["session"]["session_id"] == "s1"
    assert "seller_sub" not in result["session"]
    assert "version" not in result["session"]
    assert result["rules"] == {
        "min_increment": Decimal("5.00"),
        "max_increment": Decimal("500.00"),
        "anti_snipe_window_s": 30,
        "anti_snipe_extend_s": 60,
        "max_extensions": 10,
        "public_history_limit": 20,
    }
    assert [item["item_id"] for item in result["items"]] == ["i1", "i2"]
    assert all("seller_sub" not in item for item in result["items"])
    assert all("pk" not in item for item in result["items"])
    assert catalog.scan_calls == []


def test_get_session_enriches_a_live_item_from_the_state_table():
    catalog = FakeTable(
        get_responses=[
            {"Item": session_record(active_item_id="i2")},
            {"Item": rules_record()},
        ],
        query_responses=[
            {"Items": [item_record("i2", 2, status="LIVE")]},
        ],
    )
    state = FakeTable(
        get_responses=[
            {
                "Item": {
                    "item_id": "i2",
                    "status": "LIVE",
                    "current_price": Decimal("205.00"),
                    "end_time": Decimal("1700000300"),
                    "extension_count": Decimal("1"),
                }
            }
        ]
    )

    result = service._get_session(
        catalog,
        state,
        identity("bidder-sub", "BIDDER"),
        "s1",
    )

    assert state.get_calls == [
        {"Key": {"item_id": "i2"}, "ConsistentRead": True}
    ]
    assert result["items"][0]["live"] == {
        "status": "LIVE",
        "current_price": Decimal("205.00"),
        "end_time": 1_700_000_300,
        "extension_count": 1,
    }


@pytest.mark.parametrize(
    "viewer",
    [
        identity("seller-sub", "SELLER"),
        identity("admin-sub", "ADMIN"),
    ],
)
def test_get_draft_session_allows_only_owner_or_admin(viewer):
    catalog = FakeTable(
        get_responses=[
            {"Item": session_record(status="DRAFT")},
            {"Item": rules_record()},
        ],
        query_responses=[{"Items": []}],
    )

    result = service._get_session(catalog, FakeTable(), viewer, "s1")

    assert result["session"]["status"] == "DRAFT"
    assert len(catalog.get_calls) == 2
    assert len(catalog.query_calls) == 1


def test_get_draft_session_hides_itself_from_another_caller():
    catalog = FakeTable(
        get_responses=[{"Item": session_record(status="DRAFT")}]
    )

    with pytest.raises(NotFound) as caught:
        service._get_session(
            catalog,
            FakeTable(),
            identity("other-sub", "SELLER"),
            "s1",
        )

    assert caught.value.code == "SESSION_NOT_FOUND"
    assert catalog.get_calls == [
        {"Key": session_key("s1"), "ConsistentRead": True}
    ]
    assert catalog.query_calls == []


def test_get_session_returns_none_rules_when_optional_record_is_absent():
    catalog = FakeTable(
        get_responses=[{"Item": session_record()}, {}],
        query_responses=[{"Items": []}],
    )

    result = service._get_session(
        catalog,
        FakeTable(),
        identity("bidder-sub", "BIDDER"),
        "s1",
    )

    assert result["rules"] is None
    assert result["items"] == []


def test_get_session_raises_not_found_without_meta_before_item_query():
    catalog = FakeTable(
        get_responses=[{}],
        query_responses=[{"Items": [item_record("i1", 1)]}],
    )

    with pytest.raises(NotFound) as caught:
        service._get_session(
            catalog,
            FakeTable(),
            identity("bidder-sub", "BIDDER"),
            "missing",
        )

    assert caught.value.code == "SESSION_NOT_FOUND"
    assert catalog.get_calls == [
        {
            "Key": {"pk": "SESSION#missing", "sk": "META"},
            "ConsistentRead": True,
        }
    ]
    assert catalog.query_calls == []


def test_get_session_rejects_more_than_100_item_query_pages_without_result():
    query_responses = []
    for page in range(100):
        query_responses.append(
            {
                "Items": [item_record(f"i{page + 1}", page + 1)],
                "LastEvaluatedKey": {
                    "pk": "SESSION#s1",
                    "sk": f"ITEM#{page + 1:06d}#i{page + 1}",
                },
            }
        )
    catalog = FakeTable(
        get_responses=[{"Item": session_record()}, {"Item": rules_record()}],
        query_responses=query_responses,
    )

    with pytest.raises(RuntimeError, match="page limit"):
        service._get_session(
            catalog,
            FakeTable(),
            identity("bidder-sub", "BIDDER"),
            "s1",
        )

    assert len(catalog.query_calls) == 100


def test_list_items_queries_gsi2_with_category_filter_and_context_cursor():
    start_key = {
        "pk": "SESSION#s1",
        "sk": "ITEM#000001#i1",
        "gsi2pk": "ITEM",
        "gsi2sk": "STATUS#LIVE#CREATED#1700000000#i1",
    }
    catalog = FakeTable(
        query_responses=[
            {
                "Items": [
                    item_record(
                        status="LIVE",
                        gsi2sk="STATUS#LIVE#CREATED#1700000000#i1",
                    )
                ],
                "LastEvaluatedKey": start_key,
            }
        ]
    )

    result = service._list_items(
        catalog,
        status="LIVE",
        page_size=1,
        cursor=encode_cursor(
            start_key,
            items_context("LIVE", category_id="prints"),
        ),
        category_id="prints",
    )

    assert catalog.query_calls == [
        {
            "IndexName": "gsi2",
            "KeyConditionExpression": (
                "gsi2pk = :pk AND begins_with(gsi2sk, :prefix)"
            ),
            "ExpressionAttributeValues": {
                ":pk": "ITEM",
                ":prefix": "STATUS#LIVE#",
                ":category_id": "prints",
            },
            "Limit": 1,
            "ScanIndexForward": False,
            "ExclusiveStartKey": start_key,
            "FilterExpression": "category_id = :category_id",
        }
    ]
    assert result["items"][0]["item_id"] == "i1"
    assert "seller_sub" not in result["items"][0]
    assert "version" not in result["items"][0]
    assert "gsi2sk" not in result["items"][0]
    assert result["next_cursor"] == encode_cursor(
        start_key,
        items_context("LIVE", category_id="prints"),
    )
    assert catalog.scan_calls == []


def test_list_items_omitted_status_filters_waiting_on_gsi():
    catalog = FakeTable()

    service._list_items(
        catalog,
        status=None,
        page_size=20,
        cursor=None,
    )

    call = catalog.query_calls[0]
    assert call["ExpressionAttributeValues"] == {
        ":pk": "ITEM",
        ":prefix": "STATUS#",
        ":private_status": "WAITING",
    }
    assert call["ExpressionAttributeNames"] == {"#status": "status"}
    assert call["FilterExpression"] == "#status <> :private_status"
    assert "ExclusiveStartKey" not in call


def test_list_items_omitted_status_filters_waiting_on_session_partition():
    catalog = FakeTable()

    service._list_items(
        catalog,
        status=None,
        page_size=20,
        cursor=None,
        session_id="s1",
    )

    assert catalog.query_calls == [
        {
            "KeyConditionExpression": (
                "pk = :pk AND begins_with(sk, :item_prefix)"
            ),
            "ExpressionAttributeValues": {
                ":pk": "SESSION#s1",
                ":item_prefix": "ITEM#",
                ":private_status": "WAITING",
            },
            "ExpressionAttributeNames": {"#status": "status"},
            "FilterExpression": "#status <> :private_status",
            "ConsistentRead": True,
            "Limit": 20,
        }
    ]


def test_list_items_queries_session_partition_with_status_category_filters():
    last_key = {"pk": "SESSION#s1", "sk": "ITEM#000001#i1"}
    catalog = FakeTable(
        query_responses=[
            {
                "Items": [item_record(status="LIVE")],
                "LastEvaluatedKey": last_key,
            }
        ]
    )
    context = items_context("LIVE", "s1", "prints")

    result = service._list_items(
        catalog,
        status="LIVE",
        page_size=1,
        cursor=encode_cursor(last_key, context),
        session_id="s1",
        category_id="prints",
    )

    assert catalog.query_calls == [
        {
            "KeyConditionExpression": (
                "pk = :pk AND begins_with(sk, :item_prefix)"
            ),
            "ExpressionAttributeValues": {
                ":pk": "SESSION#s1",
                ":item_prefix": "ITEM#",
                ":status": "LIVE",
                ":category_id": "prints",
            },
            "ConsistentRead": True,
            "Limit": 1,
            "ExclusiveStartKey": last_key,
            "FilterExpression": (
                "#status = :status AND category_id = :category_id"
            ),
            "ExpressionAttributeNames": {"#status": "status"},
        }
    ]
    assert [item["item_id"] for item in result["items"]] == ["i1"]
    assert result["next_cursor"] == encode_cursor(last_key, context)


def test_list_items_fills_sparse_filtered_page_from_next_evaluated_batch():
    first_key = {
        "pk": "SESSION#s1",
        "sk": "ITEM#000001#i1",
        "gsi2pk": "ITEM",
        "gsi2sk": "STATUS#PAUSED#CREATED#1700000000#i1",
    }
    second_key = {
        "pk": "SESSION#s1",
        "sk": "ITEM#000003#i3",
        "gsi2pk": "ITEM",
        "gsi2sk": "STATUS#PAUSED#CREATED#1700000002#i3",
    }
    catalog = FakeTable(
        query_responses=[
            {
                "Items": [item_record("i1", 1, status="PAUSED")],
                "LastEvaluatedKey": first_key,
            },
            {
                "Items": [
                    item_record("i2", 2, status="PAUSED"),
                    item_record("i3", 3, status="PAUSED"),
                ],
                "LastEvaluatedKey": second_key,
            },
        ]
    )
    context = items_context("PAUSED", category_id="prints")

    result = service._list_items(
        catalog,
        status="PAUSED",
        page_size=3,
        cursor=None,
        category_id="prints",
    )

    assert [call["Limit"] for call in catalog.query_calls] == [3, 2]
    assert catalog.query_calls[1]["ExclusiveStartKey"] == first_key
    assert [item["item_id"] for item in result["items"]] == ["i1", "i2", "i3"]
    assert result["next_cursor"] == encode_cursor(second_key, context)


def test_list_items_stops_filtered_paging_after_10_batches_with_cursor():
    keys = [
        {
            "pk": "SESSION#s1",
            "sk": f"ITEM#{page:06d}#i{page}",
            "gsi2pk": "ITEM",
            "gsi2sk": f"STATUS#PAUSED#CREATED#{page:010d}#i{page}",
        }
        for page in range(1, 11)
    ]
    catalog = FakeTable(
        query_responses=[
            {"Items": [], "LastEvaluatedKey": key} for key in keys
        ]
    )
    context = items_context("PAUSED", category_id="rare")

    result = service._list_items(
        catalog,
        status="PAUSED",
        page_size=2,
        cursor=None,
        category_id="rare",
    )

    assert len(catalog.query_calls) == 10
    assert all(call["Limit"] == 2 for call in catalog.query_calls)
    assert result == {
        "items": [],
        "next_cursor": encode_cursor(keys[-1], context),
    }


@pytest.mark.parametrize(
    "cursor_context",
    [
        items_context("LIVE", category_id="prints"),
        items_context("PAUSED", category_id="books"),
        items_context("PAUSED", session_id="s1", category_id="prints"),
    ],
)
def test_list_items_rejects_cursor_from_another_filter_context(cursor_context):
    key = {
        "pk": "SESSION#s1",
        "sk": "ITEM#000001#i1",
        "gsi2pk": "ITEM",
        "gsi2sk": "STATUS#PAUSED#CREATED#1700000000#i1",
    }
    cursor = encode_cursor(key, cursor_context)
    catalog = FakeTable()

    with pytest.raises(BadRequest) as caught:
        service._list_items(
            catalog,
            "PAUSED",
            20,
            cursor,
            category_id="prints",
        )

    assert caught.value.code == "INVALID_CURSOR"
    assert catalog.query_calls == []


def test_list_items_rejects_invalid_status_and_wrong_partition_cursor():
    with pytest.raises(BadRequest) as status_error:
        service._list_items(FakeTable(), "DRAFT", 20, None)

    cursor = encode_cursor(
        {
            "pk": "SESSION#s1",
            "sk": "META",
            "gsi2pk": "SESSION",
            "gsi2sk": "STATUS#LIVE#START#1700000200#s1",
        },
        items_context("LIVE"),
    )
    with pytest.raises(BadRequest) as cursor_error:
        service._list_items(FakeTable(), "LIVE", 20, cursor)

    assert status_error.value.code == "INVALID_QUERY"
    assert cursor_error.value.code == "INVALID_CURSOR"


def test_list_items_rejects_private_waiting_status_before_query():
    catalog = FakeTable()

    with pytest.raises(BadRequest) as caught:
        service._list_items(catalog, "WAITING", 20, None)

    assert caught.value.code == "INVALID_QUERY"
    assert catalog.query_calls == []


@pytest.mark.parametrize(
    "status",
    [
        "LIVE",
        "PAUSED",
        "PENDING_ADMIN_APPROVAL",
        "SOLD",
        "UNSOLD",
        "CANCELLED",
    ],
)
def test_list_items_keeps_every_public_status_queryable(status):
    catalog = FakeTable()

    service._list_items(catalog, status, 20, None)

    assert catalog.query_calls[0]["ExpressionAttributeValues"] == {
        ":pk": "ITEM",
        ":prefix": f"STATUS#{status}#",
    }
    assert "FilterExpression" not in catalog.query_calls[0]


def test_get_item_reuses_strong_lookup_and_adds_sanitized_live_snapshot():
    catalog_item = item_record(
        status="LIVE",
        gsi2sk="STATUS#LIVE#CREATED#1700000000#i1",
    )
    catalog = FakeTable(
        get_responses=[
            {"Item": lookup_record()},
            {"Item": catalog_item},
        ]
    )
    state = FakeTable(
        get_responses=[
            {
                "Item": {
                    "item_id": "i1",
                    "status": "LIVE",
                    "current_price": Decimal("110.00"),
                    "end_time": 1_700_000_300,
                    "extension_count": 1,
                    "highest_bidder_id": "private-bidder",
                    "seller_sub": "seller-sub",
                    "owner_region": "ap-southeast-1",
                    "version": 9,
                    "internal_note": "private",
                }
            }
        ]
    )

    result = service._get_item(
        catalog,
        state,
        identity("bidder-sub", "BIDDER"),
        "i1",
    )

    assert catalog.get_calls == [
        {"Key": item_lookup_key("i1"), "ConsistentRead": True},
        {"Key": item_key("s1", 1, "i1"), "ConsistentRead": True},
    ]
    assert state.get_calls == [
        {"Key": {"item_id": "i1"}, "ConsistentRead": True}
    ]
    assert result["item_id"] == "i1"
    assert "seller_sub" not in result
    assert "version" not in result
    assert result["live"] == {
        "status": "LIVE",
        "current_price": Decimal("110.00"),
        "end_time": 1_700_000_300,
        "extension_count": 1,
    }
    assert catalog.scan_calls == []
    assert state.scan_calls == []


@pytest.mark.parametrize(
    "viewer",
    [
        identity("seller-sub", "SELLER"),
        identity("admin-sub", "ADMIN"),
    ],
)
def test_get_waiting_item_allows_only_owner_or_admin(viewer):
    catalog = FakeTable(
        get_responses=[
            {"Item": lookup_record()},
            {"Item": item_record(status="WAITING")},
        ]
    )
    state = FakeTable()

    result = service._get_item(catalog, state, viewer, "i1")

    assert result["status"] == "WAITING"
    assert state.get_calls == []


def test_get_waiting_item_hides_itself_from_another_caller():
    catalog = FakeTable(
        get_responses=[
            {"Item": lookup_record()},
            {"Item": item_record(status="WAITING")},
        ]
    )
    state = FakeTable()

    with pytest.raises(NotFound) as caught:
        service._get_item(
            catalog,
            state,
            identity("other-sub", "SELLER"),
            "i1",
        )

    assert caught.value.code == "ITEM_NOT_FOUND"
    assert state.get_calls == []


def test_get_item_delegates_catalog_lookup_to_shared_helper(monkeypatch):
    expected = item_record(status="WAITING")
    calls = []

    def fake_load_item_by_id(catalog, item_id):
        calls.append((catalog, item_id))
        return expected

    monkeypatch.setattr(service, "load_item_by_id", fake_load_item_by_id)
    catalog = FakeTable()
    state = FakeTable()

    result = service._get_item(
        catalog,
        state,
        identity("seller-sub", "SELLER"),
        "i1",
    )

    assert result["item_id"] == "i1"
    assert calls == [(catalog, "i1")]
    assert catalog.get_calls == []
    assert state.get_calls == []


def test_get_item_does_not_read_state_for_non_live_catalog_item():
    catalog = FakeTable(
        get_responses=[
            {"Item": lookup_record()},
            {"Item": item_record(status="WAITING")},
        ]
    )
    state = FakeTable()

    result = service._get_item(
        catalog,
        state,
        identity("seller-sub", "SELLER"),
        "i1",
    )

    assert "live" not in result
    assert state.get_calls == []


def test_get_item_returns_stable_conflict_when_live_state_is_missing():
    catalog = FakeTable(
        get_responses=[
            {"Item": lookup_record()},
            {
                "Item": item_record(
                    status="LIVE",
                    gsi2sk="STATUS#LIVE#CREATED#1700000000#i1",
                )
            },
        ]
    )

    with pytest.raises(Conflict) as caught:
        service._get_item(
            catalog,
            FakeTable(),
            identity("bidder-sub", "BIDDER"),
            "i1",
        )

    assert caught.value.status_code == 409
    assert caught.value.code == "ITEM_STATE_MISSING"
    assert caught.value.message == "Live item state is unavailable"


def test_get_item_preserves_lookup_not_found_and_malformed_failures():
    with pytest.raises(NotFound) as missing:
        service._get_item(
            FakeTable(),
            FakeTable(),
            identity("bidder-sub", "BIDDER"),
            "missing",
        )

    malformed_catalog = FakeTable(
        get_responses=[{"Item": lookup_record(entity_type="ITEM")}]
    )
    with pytest.raises(RuntimeError):
        service._get_item(
            malformed_catalog,
            FakeTable(),
            identity("bidder-sub", "BIDDER"),
            "i1",
        )

    assert missing.value.code == "ITEM_NOT_FOUND"


def test_my_bids_queries_trusted_bidder_index_descending_and_sanitizes():
    last_key = {
        "item_id": "i1",
        "sk": "1700000000123#request-1",
        "bidder_sub": "bidder-sub",
    }
    events = FakeTable(
        query_responses=[
            {
                "Items": [
                    {
                        **last_key,
                        "request_id": "request-1",
                        "amount": Decimal("101.00"),
                        "status": "ACCEPTED",
                        "reason": "",
                        "private_detail": "hidden",
                    }
                ],
                "LastEvaluatedKey": last_key,
            }
        ]
    )

    result = service._my_bids(
        events,
        identity("bidder-sub", "BIDDER"),
        page_size=15,
        cursor=None,
    )

    assert events.query_calls == [
        {
            "IndexName": "bidder_sub-sk-index",
            "KeyConditionExpression": "bidder_sub = :sub",
            "ExpressionAttributeValues": {":sub": "bidder-sub"},
            "Limit": 15,
            "ScanIndexForward": False,
        }
    ]
    assert result == {
        "items": [
            {
                "item_id": "i1",
                "request_id": "request-1",
                "amount": Decimal("101.00"),
                "status": "ACCEPTED",
                "reason": "",
            }
        ],
        "next_cursor": encode_cursor(last_key, bids_context("bidder-sub")),
    }
    assert events.scan_calls == []


def test_my_bids_allows_admin_and_rejects_non_bidder():
    service._my_bids(
        FakeTable(),
        identity("admin-sub", "ADMIN"),
        page_size=20,
        cursor=None,
    )

    with pytest.raises(Forbidden):
        service._my_bids(
            FakeTable(),
            identity("seller-sub", "SELLER"),
            page_size=20,
            cursor=None,
        )


def test_my_bids_rejects_cursor_bound_to_another_bidder():
    cursor = encode_cursor(
        {
            "item_id": "i1",
            "sk": "1700000000123#request-1",
            "bidder_sub": "other-sub",
        },
        bids_context("other-sub"),
    )

    with pytest.raises(BadRequest) as caught:
        service._my_bids(
            FakeTable(), identity("bidder-sub", "BIDDER"), 20, cursor
        )

    assert caught.value.code == "INVALID_CURSOR"


def test_mine_route_uses_authorizer_subject_not_query_override(monkeypatch):
    catalog = FakeTable()
    monkeypatch.setattr(service, "_catalog_table", lambda: catalog)

    response = service.handler(
        rest_event(
            "GET",
            "/api/v1/auction-sessions/mine",
            query={
                "pageSize": "7",
                "seller_sub": "forged-sub",
            },
            sub="authorizer-sub",
            groups="SELLER",
        ),
        None,
    )

    assert response["statusCode"] == 200
    assert response_body(response) == {
        "status": 200,
        "code": "SESSIONS_LISTED",
        "message": "Sessions listed",
        "data": {"items": [], "next_cursor": None},
    }
    assert catalog.query_calls[0]["ExpressionAttributeValues"][":pk"] == (
        "SELLER#authorizer-sub"
    )
    assert catalog.query_calls[0]["Limit"] == 7


def test_my_bids_route_uses_authorizer_subject_not_query_override(monkeypatch):
    events = FakeTable()
    monkeypatch.setattr(service, "_events_table", lambda: events)

    response = service.handler(
        rest_event(
            "GET",
            "/api/v1/bids/my",
            query={"bidder_sub": "forged-sub"},
            sub="authorizer-sub",
            groups="BIDDER",
        ),
        None,
    )

    assert response["statusCode"] == 200
    assert response_body(response)["code"] == "BIDS_LISTED"
    assert events.query_calls[0]["ExpressionAttributeValues"] == {
        ":sub": "authorizer-sub"
    }
    assert events.query_calls[0]["Limit"] == 20


def test_public_list_route_does_not_require_lambda_identity(monkeypatch):
    catalog = FakeTable()
    monkeypatch.setattr(service, "_catalog_table", lambda: catalog)

    response = service.handler(
        rest_event(
            "GET",
            "/api/v1/auction-sessions",
            query={"status": "SCHEDULED", "pageSize": "1"},
        ),
        None,
    )

    assert response["statusCode"] == 200
    assert response_body(response)["code"] == "SESSIONS_LISTED"
    assert catalog.query_calls[0]["Limit"] == 1


def test_actual_handler_keeps_cors_headers_on_success_and_service_error(monkeypatch):
    monkeypatch.setenv("CORS_ALLOWED_ORIGIN", "https://auction.example.com")
    monkeypatch.setattr(service, "_catalog_table", lambda: FakeTable())

    success = service.handler(
        rest_event("GET", "/api/v1/auction-sessions"),
        None,
    )
    service_error = service.handler(
        rest_event(
            "GET",
            "/api/v1/auction-sessions/mine",
            sub="bidder-sub",
            groups="BIDDER",
        ),
        None,
    )

    assert success["statusCode"] == 200
    assert service_error["statusCode"] == 403
    assert_cors_headers(success)
    assert_cors_headers(service_error)


@pytest.mark.parametrize("page_size", ["0", "101", "one", "1.5", ""])
def test_route_returns_stable_400_for_invalid_page_size(monkeypatch, page_size):
    catalog = FakeTable()
    monkeypatch.setattr(service, "_catalog_table", lambda: catalog)

    response = service.handler(
        rest_event(
            "GET",
            "/api/v1/auction-sessions",
            query={"pageSize": page_size},
        ),
        None,
    )

    assert response["statusCode"] == 400
    assert response_body(response) == {
        "status": 400,
        "code": "INVALID_QUERY",
        "message": "Query parameters are invalid",
        "data": None,
    }
    assert catalog.query_calls == []


def test_route_returns_stable_400_for_invalid_cursor(monkeypatch):
    catalog = FakeTable()
    monkeypatch.setattr(service, "_catalog_table", lambda: catalog)

    response = service.handler(
        rest_event(
            "GET",
            "/api/v1/auction-sessions",
            query={"cursor": "%%%"},
        ),
        None,
    )

    assert response["statusCode"] == 400
    assert response_body(response) == {
        "status": 400,
        "code": "INVALID_CURSOR",
        "message": "Cursor is invalid",
        "data": None,
    }
    assert catalog.query_calls == []


def test_item_list_route_parses_all_supported_filters(monkeypatch):
    catalog = FakeTable()
    monkeypatch.setattr(service, "_catalog_table", lambda: catalog)

    response = service.handler(
        rest_event(
            "GET",
            "/api/v1/auction-items",
            query={
                "status": "PAUSED",
                "pageSize": "5",
                "sessionId": "s1",
                "categoryId": "prints",
            },
        ),
        None,
    )

    assert response["statusCode"] == 200
    assert response_body(response)["code"] == "ITEMS_LISTED"
    call = catalog.query_calls[0]
    assert call["Limit"] == 5
    assert call["ExpressionAttributeValues"][":pk"] == "SESSION#s1"
    assert call["ExpressionAttributeValues"][":status"] == "PAUSED"
    assert call["ExpressionAttributeValues"][":category_id"] == "prints"


def test_session_detail_route_returns_stable_200_and_404(monkeypatch):
    catalog = FakeTable(
        get_responses=[
            {"Item": session_record()},
            {},
            {},
        ],
        query_responses=[{"Items": []}],
    )
    monkeypatch.setattr(service, "_catalog_table", lambda: catalog)
    monkeypatch.setattr(service, "_state_table", lambda: FakeTable())

    found = service.handler(
        rest_event(
            "GET",
            "/api/v1/auction-sessions/s1",
            sub="bidder-sub",
            groups="BIDDER",
        ),
        None,
    )
    missing = service.handler(
        rest_event(
            "GET",
            "/api/v1/auction-sessions/missing",
            sub="bidder-sub",
            groups="BIDDER",
        ),
        None,
    )

    assert found["statusCode"] == 200
    assert response_body(found)["code"] == "SESSION_FOUND"
    assert missing["statusCode"] == 404
    assert response_body(missing) == {
        "status": 404,
        "code": "SESSION_NOT_FOUND",
        "message": "Session was not found",
        "data": None,
    }


def test_item_detail_route_returns_stable_200_and_missing_state_409(monkeypatch):
    catalog = FakeTable(
        get_responses=[
            {"Item": lookup_record()},
            {"Item": item_record()},
            {"Item": lookup_record()},
            {
                "Item": item_record(
                    status="LIVE",
                    gsi2sk="STATUS#LIVE#CREATED#1700000000#i1",
                )
            },
        ]
    )
    state = FakeTable()
    monkeypatch.setattr(service, "_catalog_table", lambda: catalog)
    monkeypatch.setattr(service, "_state_table", lambda: state)

    found = service.handler(
        rest_event(
            "GET",
            "/api/v1/auction-items/i1",
            sub="seller-sub",
            groups="SELLER",
        ),
        None,
    )
    conflict = service.handler(
        rest_event(
            "GET",
            "/api/v1/auction-items/i1",
            sub="seller-sub",
            groups="SELLER",
        ),
        None,
    )

    assert found["statusCode"] == 200
    assert response_body(found)["code"] == "ITEM_FOUND"
    assert conflict["statusCode"] == 409
    assert response_body(conflict)["code"] == "ITEM_STATE_MISSING"


def test_live_item_route_keeps_integer_contract_fields_numeric(monkeypatch):
    catalog = FakeTable(
        get_responses=[
            {"Item": lookup_record()},
            {
                "Item": item_record(
                    status="LIVE",
                    sequence_number=Decimal("1"),
                    duration_s=Decimal("90"),
                    created_at=Decimal("1700000000"),
                    updated_at=Decimal("1700000100"),
                    gsi2sk="STATUS#LIVE#CREATED#1700000000#i1",
                )
            },
        ]
    )
    state = FakeTable(
        get_responses=[
            {
                "Item": {
                    "item_id": "i1",
                    "status": "LIVE",
                    "current_price": Decimal("105.00"),
                    "end_time": Decimal("1700000300"),
                    "extension_count": Decimal("1"),
                }
            }
        ]
    )
    monkeypatch.setattr(service, "_catalog_table", lambda: catalog)
    monkeypatch.setattr(service, "_state_table", lambda: state)

    response = service.handler(
        rest_event(
            "GET",
            "/api/v1/auction-items/i1",
            sub="bidder-sub",
            groups="BIDDER",
        ),
        None,
    )

    data = response_body(response)["data"]
    assert response["statusCode"] == 200
    assert data["start_price"] == "100.00"
    assert data["live"]["current_price"] == "105.00"
    for field in ("sequence_number", "duration_s", "created_at", "updated_at"):
        assert type(data[field]) is int
    for field in ("end_time", "extension_count"):
        assert type(data["live"][field]) is int


def test_malformed_lookup_is_a_generic_route_500(monkeypatch):
    catalog = FakeTable(
        get_responses=[{"Item": lookup_record(entity_type="ITEM")}]
    )
    monkeypatch.setattr(service, "_catalog_table", lambda: catalog)
    monkeypatch.setattr(service, "_state_table", lambda: FakeTable())

    response = service.handler(
        rest_event(
            "GET",
            "/api/v1/auction-items/i1",
            sub="seller-sub",
            groups="SELLER",
        ),
        None,
    )

    assert response["statusCode"] == 500
    assert response_body(response) == {
        "status": 500,
        "code": "INTERNAL_ERROR",
        "message": "Internal server error",
        "data": None,
    }
    assert "invalid entity type" not in response["body"]


def test_personal_routes_return_stable_403(monkeypatch):
    monkeypatch.setattr(service, "_catalog_table", lambda: FakeTable())
    monkeypatch.setattr(service, "_events_table", lambda: FakeTable())

    mine = service.handler(
        rest_event(
            "GET",
            "/api/v1/auction-sessions/mine",
            sub="bidder-sub",
            groups="BIDDER",
        ),
        None,
    )
    bids = service.handler(
        rest_event(
            "GET",
            "/api/v1/bids/my",
            sub="seller-sub",
            groups="SELLER",
        ),
        None,
    )

    for response in (mine, bids):
        assert response["statusCode"] == 403
        assert response_body(response)["code"] == "FORBIDDEN"


def test_invalid_json_handler_has_stable_400_without_parser_details():
    error = json.JSONDecodeError("sensitive parser detail", "{", 1)

    response = service.handle_invalid_json(error)

    assert response.status_code == 400
    assert json.loads(response.body) == {
        "status": 400,
        "code": "INVALID_JSON",
        "message": "Request body must be valid JSON",
        "data": None,
    }


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("POST", "/api/v1/auction-sessions"),
        ("PUT", "/api/v1/auction-sessions/s1"),
        ("DELETE", "/api/v1/auction-items/i1"),
        ("POST", "/api/v1/bids/my"),
    ],
)
def test_query_service_exposes_no_mutation_route(method, path):
    response = service.handler(rest_event(method, path), None)

    assert response["statusCode"] == 404
    assert response_body(response)["code"] == "ROUTE_NOT_FOUND"
