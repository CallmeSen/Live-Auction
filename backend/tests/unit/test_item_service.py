import json
import logging
from decimal import Decimal

import pytest
from botocore.exceptions import ClientError

from auction_common.catalog import (
    item_key,
    item_lookup_key,
    item_order_key,
    rules_key,
    serialize_item,
    serialize_values,
    session_key,
)
from auction_common.http import (
    BadRequest,
    Conflict,
    Forbidden,
    NotFound,
    RequestIdentity,
)
from auction_common.models import CreateItemRequest, PresignImageRequest
from functions.item_service import handler as service


_MISSING = object()


def client_error(
    code,
    operation="DynamoOperation",
    message="sensitive AWS internal detail",
    cancellation_reasons=_MISSING,
):
    response = {"Error": {"Code": code, "Message": message}}
    if cancellation_reasons is not _MISSING:
        response["CancellationReasons"] = cancellation_reasons
    return ClientError(response, operation)


class FakeDynamoClient:
    def __init__(self, error=None):
        self.error = error
        self.transact_calls = []

    def transact_write_items(self, **kwargs):
        self.transact_calls.append(kwargs)
        if self.error:
            raise self.error


class FakeMeta:
    def __init__(self, client):
        self.client = client


class FakeCatalog:
    name = "auction-catalog"

    def __init__(
        self,
        session=None,
        rules=None,
        lookup=None,
        base_item=None,
        query_responses=None,
        transaction_error=None,
        update_error=None,
    ):
        self.session = session
        self.rules = rules
        self.lookup = lookup
        self.base_item = base_item
        self.query_responses = list(query_responses or [])
        self.update_error = update_error
        self.get_calls = []
        self.query_calls = []
        self.scan_calls = []
        self.update_calls = []
        self.meta = FakeMeta(FakeDynamoClient(transaction_error))
        self._transaction_client = self.meta.client

    def get_item(self, **kwargs):
        self.get_calls.append(kwargs)
        key = kwargs["Key"]
        if key["sk"] == "META":
            item = self.session
        elif key["sk"] == "RULES":
            item = self.rules
        elif key["sk"] == "LOOKUP":
            item = self.lookup
        elif key["sk"].startswith("ITEM#"):
            item = self.base_item
        else:
            item = None
        return {"Item": item} if item is not None else {}

    def query(self, **kwargs):
        self.query_calls.append(kwargs)
        if self.query_responses:
            return self.query_responses.pop(0)
        return {"Items": []}

    def scan(self, **kwargs):
        self.scan_calls.append(kwargs)
        raise AssertionError("item lookup must not scan")

    def update_item(self, **kwargs):
        self.update_calls.append(kwargs)
        if self.update_error:
            raise self.update_error


class FakeCategoryTable:
    def __init__(self, category=None):
        self.category = category
        self.get_calls = []

    def get_item(self, **kwargs):
        self.get_calls.append(kwargs)
        return {"Item": self.category} if self.category is not None else {}


class FakeS3:
    def __init__(self, error=None, result=None):
        self.error = error
        self.result = result or {
            "url": "https://media.example/upload?signature=secret",
            "fields": {"policy": "secret-policy"},
        }
        self.presign_calls = []
        self.put_calls = []

    def generate_presigned_post(self, **kwargs):
        self.presign_calls.append(kwargs)
        if self.error:
            raise self.error
        return self.result

    def generate_presigned_url(self, **kwargs):
        self.put_calls.append(kwargs)
        raise AssertionError("presigned PUT must not be used")


def identity(sub="trusted-sub", *groups):
    return RequestIdentity(
        sub=sub, groups=frozenset(groups or ("USER",)), claims={}
    )


def session(**overrides):
    value = {
        **session_key("s1"),
        "session_id": "s1",
        "seller_sub": "trusted-sub",
        "status": "DRAFT",
        "version": 7,
        "item_count": 2,
    }
    value.update(overrides)
    return value


def item_request(**overrides):
    values = {
        "name": " Lot one ",
        "description": "Signed print",
        "category_id": "prints",
        "sequence_number": 3,
        "start_price": "100.25",
        "duration_s": 90,
        "seller_sub": "forged-sub",
    }
    values.update(overrides)
    return CreateItemRequest.model_validate(values)


def catalog_item(**overrides):
    value = {
        **item_key("s1", 3, "i1"),
        "entity_type": "ITEM",
        "item_id": "i1",
        "session_id": "s1",
        "sequence_number": 3,
        "name": "Lot one",
        "description": "Signed print",
        "category_id": "prints",
        "start_price": Decimal("100.25"),
        "duration_s": 90,
        "status": "WAITING",
        "seller_sub": "trusted-sub",
        "image_keys": [],
        "version": 1,
        "created_at": 1_700_000_000,
        "updated_at": 1_700_000_000,
        "gsi1pk": "ITEM#i1",
        "gsi1sk": "META",
        "gsi2pk": "ITEM",
        "gsi2sk": "STATUS#WAITING#CREATED#1700000000#i1",
    }
    value.update(overrides)
    return value


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


def presign_request(content_type="image/png", size_bytes=1024, **extra):
    return PresignImageRequest.model_validate(
        {
            "content_type": content_type,
            "size_bytes": size_bytes,
            **extra,
        }
    )


def rest_event(method, path, body, sub="trusted-sub", groups="USER"):
    return {
        "httpMethod": method,
        "path": path,
        "headers": {"Content-Type": "application/json"},
        "multiValueHeaders": {},
        "queryStringParameters": None,
        "multiValueQueryStringParameters": None,
        "pathParameters": None,
        "stageVariables": None,
        "requestContext": {
            "authorizer": {
                "claims": {"sub": sub, "cognito:groups": groups},
            }
        },
        "body": json.dumps(body),
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
        "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,OPTIONS",
    }


def conditional_cancellation(position):
    reasons = [{"Code": "None"} for _ in range(5)]
    reasons[position] = {
        "Code": "ConditionalCheckFailed",
        "Message": "sensitive condition detail",
    }
    return client_error(
        "TransactionCanceledException",
        "TransactWriteItems",
        cancellation_reasons=reasons,
    )


def test_create_item_strongly_reads_session_and_rules_before_mutating():
    catalog = FakeCatalog(session=session(), rules={**rules_key("s1")})

    service._create_item(
        identity(), "s1", item_request(), catalog, "i1", 1_700_000_000
    )

    assert catalog.get_calls == [
        {"Key": session_key("s1"), "ConsistentRead": True},
        {"Key": rules_key("s1"), "ConsistentRead": True},
    ]


def test_create_item_rejects_missing_session_before_mutation():
    catalog = FakeCatalog(rules={**rules_key("missing")})

    with pytest.raises(NotFound) as caught:
        service._create_item(
            identity(), "missing", item_request(), catalog, "i1", 1_700_000_000
        )

    assert caught.value.code == "SESSION_NOT_FOUND"
    assert catalog.meta.client.transact_calls == []


def test_create_item_rejects_another_sellers_session_before_mutation():
    catalog = FakeCatalog(
        session=session(seller_sub="other-sub"), rules={**rules_key("s1")}
    )

    with pytest.raises(Forbidden):
        service._create_item(
            identity(), "s1", item_request(), catalog, "i1", 1_700_000_000
        )

    assert catalog.meta.client.transact_calls == []


def test_create_item_requires_seller_or_admin_before_reading_catalog():
    catalog = FakeCatalog(session=session(), rules={**rules_key("s1")})

    with pytest.raises(Forbidden):
        service._create_item(
            identity("bidder-sub", "BIDDER"),
            "s1",
            item_request(),
            catalog,
            "i1",
            1_700_000_000,
        )

    assert catalog.get_calls == []


def test_create_item_allows_admin_to_operate_another_sellers_session():
    catalog = FakeCatalog(
        session=session(seller_sub="actual-owner"), rules={**rules_key("s1")}
    )

    service._create_item(
        identity("admin-sub", "ADMIN"),
        "s1",
        item_request(),
        catalog,
        "i1",
        1_700_000_000,
    )

    operations = catalog.meta.client.transact_calls[0]["TransactItems"]
    assert operations[3]["Put"]["Item"]["seller_sub"] == {"S": "actual-owner"}
    update = operations[4]["Update"]
    assert update["ConditionExpression"] == (
        "#status = :draft AND version = :expected "
        "AND seller_sub = :session_seller"
    )
    assert update["ExpressionAttributeValues"][":session_seller"] == {
        "S": "actual-owner"
    }
    assert {"S": "admin-sub"} not in update["ExpressionAttributeValues"].values()


def test_create_item_rejects_non_draft_session_before_mutation():
    catalog = FakeCatalog(
        session=session(status="SCHEDULED"), rules={**rules_key("s1")}
    )

    with pytest.raises(Conflict) as caught:
        service._create_item(
            identity(), "s1", item_request(), catalog, "i1", 1_700_000_000
        )

    assert caught.value.code == "SESSION_NOT_DRAFT"
    assert catalog.meta.client.transact_calls == []


def test_create_item_requires_rules_before_mutation():
    catalog = FakeCatalog(session=session())

    with pytest.raises(BadRequest) as caught:
        service._create_item(
            identity(), "s1", item_request(), catalog, "i1", 1_700_000_000
        )

    assert caught.value.code == "RULES_REQUIRED"
    assert catalog.meta.client.transact_calls == []


def test_create_item_rejects_inactive_category_before_mutation():
    catalog = FakeCatalog(session=session(), rules={**rules_key("s1")})
    categories = FakeCategoryTable(
        {
            "category_id": "prints",
            "name": "Prints",
            "slug": "prints",
            "status": "INACTIVE",
        }
    )

    with pytest.raises(BadRequest) as caught:
        service._create_item(
            identity(),
            "s1",
            item_request(category_id="prints"),
            catalog,
            "i1",
            1_700_000_000,
            category_table=categories,
        )

    assert caught.value.code == "CATEGORY_NOT_ACTIVE"
    assert catalog.meta.client.transact_calls == []
    assert categories.get_calls == [{"Key": {"category_id": "prints"}}]


def test_create_item_writes_exact_five_key_transaction_and_complete_item():
    catalog = FakeCatalog(session=session(), rules={**rules_key("s1")})

    result = service._create_item(
        identity(), "s1", item_request(), catalog, "i1", 1_700_000_000
    )

    expected_item = catalog_item()
    expected_order = {
        **item_order_key("s1", 3),
        "entity_type": "ITEM_ORDER",
        "item_id": "i1",
        "session_id": "s1",
        "sequence_number": 3,
    }
    expected_lookup = {
        **item_lookup_key("i1"),
        "entity_type": "ITEM_LOOKUP",
        "item_id": "i1",
        "session_id": "s1",
        "sequence_number": 3,
    }
    expected_condition = (
        "#status = :draft AND version = :expected "
        "AND seller_sub = :session_seller"
    )
    assert result == {"item_id": "i1", "status": "WAITING", "version": 1}
    assert catalog.meta.client.transact_calls == [
        {
            "TransactItems": [
                {
                    "ConditionCheck": {
                        "TableName": "auction-catalog",
                        "Key": serialize_item(rules_key("s1")),
                        "ConditionExpression": "attribute_exists(pk)",
                    }
                },
                {
                    "Put": {
                        "TableName": "auction-catalog",
                        "Item": serialize_item(expected_order),
                        "ConditionExpression": "attribute_not_exists(pk)",
                    }
                },
                {
                    "Put": {
                        "TableName": "auction-catalog",
                        "Item": serialize_item(expected_lookup),
                        "ConditionExpression": "attribute_not_exists(pk)",
                    }
                },
                {
                    "Put": {
                        "TableName": "auction-catalog",
                        "Item": serialize_item(expected_item),
                        "ConditionExpression": "attribute_not_exists(pk)",
                    }
                },
                {
                    "Update": {
                        "TableName": "auction-catalog",
                        "Key": serialize_item(session_key("s1")),
                        "UpdateExpression": (
                            "SET item_count = item_count + :one, "
                            "version = version + :one, updated_at = :now"
                        ),
                        "ConditionExpression": expected_condition,
                        "ExpressionAttributeNames": {"#status": "status"},
                        "ExpressionAttributeValues": serialize_values(
                            {
                                ":one": 1,
                                ":now": 1_700_000_000,
                                ":draft": "DRAFT",
                                ":expected": 7,
                                ":session_seller": "trusted-sub",
                            }
                        ),
                    }
                },
            ]
        }
    ]
    operations = catalog.meta.client.transact_calls[0]["TransactItems"]
    keys = [
        operation[next(iter(operation))].get("Key")
        or {
            key: value
            for key, value in operation[next(iter(operation))]["Item"].items()
            if key in {"pk", "sk"}
        }
        for operation in operations
    ]
    assert len({json.dumps(key, sort_keys=True) for key in keys}) == 5


@pytest.mark.parametrize(
    ("position", "error_type", "expected_code", "expected_status"),
    [
        (0, BadRequest, "RULES_REQUIRED", 400),
        (1, Conflict, "ITEM_ORDER_CONFLICT", 409),
        (2, Conflict, "ITEM_ID_CONFLICT", 409),
        (3, Conflict, "ITEM_ID_CONFLICT", 409),
        (4, Conflict, "SESSION_CHANGED", 409),
    ],
)
def test_create_item_maps_transaction_reason_by_operation_position(
    position, error_type, expected_code, expected_status
):
    catalog = FakeCatalog(
        session=session(),
        rules={**rules_key("s1")},
        transaction_error=conditional_cancellation(position),
    )

    with pytest.raises(error_type) as caught:
        service._create_item(
            identity(), "s1", item_request(), catalog, "i1", 1_700_000_000
        )

    assert caught.value.code == expected_code
    assert caught.value.status_code == expected_status
    assert "sensitive" not in caught.value.message


def test_create_item_maps_one_conditional_when_all_other_reasons_are_neutral():
    catalog = FakeCatalog(
        session=session(),
        rules={**rules_key("s1")},
        transaction_error=client_error(
            "TransactionCanceledException",
            "TransactWriteItems",
            cancellation_reasons=[
                {"Code": None},
                {},
                {"Code": "ConditionalCheckFailed"},
                {"Code": "None"},
                {"Code": None},
            ],
        ),
    )

    with pytest.raises(Conflict) as caught:
        service._create_item(
            identity(), "s1", item_request(), catalog, "i1", 1_700_000_000
        )

    assert caught.value.code == "ITEM_ID_CONFLICT"


def test_create_item_prioritizes_order_conflict_when_order_and_session_fail():
    catalog = FakeCatalog(
        session=session(),
        rules={**rules_key("s1")},
        transaction_error=client_error(
            "TransactionCanceledException",
            "TransactWriteItems",
            cancellation_reasons=[
                {"Code": "None"},
                {"Code": "ConditionalCheckFailed"},
                {"Code": "None"},
                {"Code": "None"},
                {"Code": "ConditionalCheckFailed"},
            ],
        ),
    )

    with pytest.raises(Conflict) as caught:
        service._create_item(
            identity(), "s1", item_request(), catalog, "i1", 1_700_000_000
        )

    assert caught.value.code == "ITEM_ORDER_CONFLICT"


def test_create_item_prioritizes_item_id_when_lookup_and_item_fail():
    catalog = FakeCatalog(
        session=session(),
        rules={**rules_key("s1")},
        transaction_error=client_error(
            "TransactionCanceledException",
            "TransactWriteItems",
            cancellation_reasons=[
                {"Code": "None"},
                {"Code": "None"},
                {"Code": "ConditionalCheckFailed"},
                {"Code": "ConditionalCheckFailed"},
                {"Code": "None"},
            ],
        ),
    )

    with pytest.raises(Conflict) as caught:
        service._create_item(
            identity(), "s1", item_request(), catalog, "i1", 1_700_000_000
        )

    assert caught.value.code == "ITEM_ID_CONFLICT"


@pytest.mark.parametrize(
    "cancellation_reasons",
    [
        pytest.param(
            [
                {"Code": "ConditionalCheckFailed"},
                {"Code": "TransactionConflict"},
                {"Code": "None"},
                {"Code": "None"},
                {"Code": "None"},
            ],
            id="conditional-and-transaction-conflict",
        ),
        pytest.param(
            [
                {"Code": "None"},
                {"Code": "ProvisionedThroughputExceeded"},
                {"Code": "ConditionalCheckFailed"},
                {"Code": "None"},
                {"Code": "None"},
            ],
            id="conditional-and-throttling",
        ),
    ],
)
def test_create_item_reraises_ambiguous_mixed_transaction_reasons(
    cancellation_reasons,
):
    error = client_error(
        "TransactionCanceledException",
        "TransactWriteItems",
        cancellation_reasons=cancellation_reasons,
    )
    catalog = FakeCatalog(
        session=session(),
        rules={**rules_key("s1")},
        transaction_error=error,
    )

    with pytest.raises(ClientError) as caught:
        service._create_item(
            identity(), "s1", item_request(), catalog, "i1", 1_700_000_000
        )

    assert caught.value is error


@pytest.mark.parametrize(
    "error",
    [
        client_error("TransactionCanceledException", "TransactWriteItems"),
        client_error(
            "TransactionCanceledException",
            "TransactWriteItems",
            cancellation_reasons=[{"Code": "TransactionConflict"}],
        ),
        client_error(
            "TransactionCanceledException",
            "TransactWriteItems",
            cancellation_reasons=[{"Code": "None"} for _ in range(5)],
        ),
        client_error(
            "TransactionCanceledException",
            "TransactWriteItems",
            cancellation_reasons=[
                {"Code": "None"},
                {"Code": "None"},
                "malformed",
                {"Code": "None"},
                {"Code": "None"},
            ],
        ),
        client_error("ConditionalCheckFailedException", "TransactWriteItems"),
        client_error("ProvisionedThroughputExceededException", "TransactWriteItems"),
    ],
)
def test_create_item_reraises_unqualified_or_nonconditional_aws_errors(error):
    catalog = FakeCatalog(
        session=session(),
        rules={**rules_key("s1")},
        transaction_error=error,
    )

    with pytest.raises(ClientError) as caught:
        service._create_item(
            identity(), "s1", item_request(), catalog, "i1", 1_700_000_000
        )

    assert caught.value is error


def test_find_item_strongly_reads_lookup_then_base_item_without_query_or_scan():
    expected = catalog_item()
    catalog = FakeCatalog(lookup=lookup_record(), base_item=expected)

    result = service._find_item(catalog, "i1")

    assert result is expected
    assert catalog.get_calls == [
        {"Key": item_lookup_key("i1"), "ConsistentRead": True},
        {"Key": item_key("s1", 3, "i1"), "ConsistentRead": True},
    ]
    assert catalog.query_calls == []
    assert catalog.scan_calls == []


def test_find_item_delegates_to_shared_catalog_loader(monkeypatch):
    expected = catalog_item()
    calls = []

    def fake_load_item_by_id(catalog, item_id):
        calls.append((catalog, item_id))
        return expected

    monkeypatch.setattr(service, "load_item_by_id", fake_load_item_by_id)
    catalog = FakeCatalog()

    assert service._find_item(catalog, "i1") is expected
    assert calls == [(catalog, "i1")]


def test_find_item_rejects_missing_lookup_record():
    catalog = FakeCatalog()

    with pytest.raises(NotFound) as caught:
        service._find_item(catalog, "i1")

    assert caught.value.code == "ITEM_NOT_FOUND"
    assert catalog.get_calls == [
        {"Key": item_lookup_key("i1"), "ConsistentRead": True}
    ]


def test_find_item_rejects_missing_base_item():
    catalog = FakeCatalog(lookup=lookup_record())

    with pytest.raises(NotFound) as caught:
        service._find_item(catalog, "i1")

    assert caught.value.code == "ITEM_NOT_FOUND"
    assert catalog.get_calls == [
        {"Key": item_lookup_key("i1"), "ConsistentRead": True},
        {"Key": item_key("s1", 3, "i1"), "ConsistentRead": True},
    ]


@pytest.mark.parametrize(
    "lookup",
    [
        lookup_record(entity_type="ITEM"),
        lookup_record(pk="ITEM#other"),
        lookup_record(sk="META"),
        lookup_record(item_id="other"),
        lookup_record(session_id=""),
        lookup_record(sequence_number=True),
        lookup_record(sequence_number=0),
    ],
)
def test_find_item_treats_malformed_lookup_as_data_consistency_error(lookup):
    catalog = FakeCatalog(lookup=lookup, base_item=catalog_item())

    with pytest.raises(RuntimeError):
        service._find_item(catalog, "i1")

    assert len(catalog.get_calls) == 1


@pytest.mark.parametrize(
    "base_item",
    [
        catalog_item(entity_type="ITEM_LOOKUP"),
        catalog_item(item_id="other"),
        catalog_item(session_id="other"),
        catalog_item(sequence_number=4),
        catalog_item(pk="SESSION#other"),
        catalog_item(sk="ITEM#000004#i1"),
    ],
)
def test_find_item_treats_malformed_base_item_as_data_consistency_error(base_item):
    catalog = FakeCatalog(lookup=lookup_record(), base_item=base_item)

    with pytest.raises(RuntimeError):
        service._find_item(catalog, "i1")

    assert len(catalog.get_calls) == 2


@pytest.mark.parametrize("unsafe_id", ["../i1", "a/b", "a\\b", ".", "..", "bad\nvalue"])
def test_find_item_rejects_unsafe_catalog_item_identifier(unsafe_id):
    catalog = FakeCatalog()

    with pytest.raises(BadRequest) as caught:
        service._find_item(catalog, unsafe_id)

    assert caught.value.code == "INVALID_ITEM_ID"
    assert catalog.get_calls == []
    assert catalog.query_calls == []


@pytest.mark.parametrize(
    ("content_type", "extension"),
    [
        ("image/jpeg", "jpg"),
        ("image/png", "png"),
        ("image/webp", "webp"),
    ],
)
def test_presign_uses_exact_mime_mapping_post_policy_and_trusted_owner(
    content_type, extension
):
    item = catalog_item()
    catalog = FakeCatalog()
    s3 = FakeS3()

    result = service._presign_image(
        identity(),
        item,
        presign_request(
            content_type=content_type,
            size_bytes=2048,
            seller_sub="forged-sub",
        ),
        catalog,
        s3,
        "la-media",
        "2dc9101e-f66f-49e5-8448-19e874822c8a",
        4096,
    )

    object_key = (
        "items/trusted-sub/i1/2dc9101e-f66f-49e5-8448-19e874822c8a."
        f"{extension}"
    )
    assert s3.presign_calls == [
        {
            "Bucket": "la-media",
            "Key": object_key,
            "Fields": {"Content-Type": content_type},
            "Conditions": [
                {"Content-Type": content_type},
                ["content-length-range", 1, 4096],
            ],
            "ExpiresIn": 300,
        }
    ]
    assert s3.put_calls == []
    assert result == {
        "url": "https://media.example/upload?signature=secret",
        "fields": {"policy": "secret-policy"},
        "object_key": object_key,
        "expires_in": 300,
    }


def test_presign_accepts_size_exactly_equal_to_runtime_maximum():
    s3 = FakeS3()

    service._presign_image(
        identity(),
        catalog_item(),
        presign_request(size_bytes=2048),
        FakeCatalog(),
        s3,
        "la-media",
        "image-1",
        2048,
    )

    assert s3.presign_calls[0]["Conditions"][1] == [
        "content-length-range",
        1,
        2048,
    ]


def test_presign_accepts_dynamodb_decimal_item_version():
    s3 = FakeS3()

    result = service._presign_image(
        identity(),
        catalog_item(version=Decimal("1")),
        presign_request(),
        FakeCatalog(),
        s3,
        "la-media",
        "image-1",
        2048,
    )

    assert result["expires_in"] == 300
    assert s3.presign_calls


def test_presign_accepts_dynamodb_decimal_item_sequence_number():
    s3 = FakeS3()

    result = service._presign_image(
        identity(),
        catalog_item(sequence_number=Decimal("3")),
        presign_request(),
        FakeCatalog(),
        s3,
        "la-media",
        "image-1",
        2048,
    )

    assert result["expires_in"] == 300
    assert s3.presign_calls


def test_presign_caps_large_runtime_limit_at_hard_five_mib_maximum():
    hard_max = 5 * 1024 * 1024
    s3 = FakeS3()

    service._presign_image(
        identity(),
        catalog_item(),
        presign_request(size_bytes=hard_max),
        FakeCatalog(),
        s3,
        "la-media",
        "image-1",
        10 * 1024 * 1024,
    )

    assert s3.presign_calls[0]["Conditions"][1] == [
        "content-length-range",
        1,
        hard_max,
    ]


@pytest.mark.parametrize("max_bytes", [0, -1])
def test_presign_rejects_nonpositive_runtime_maximum_as_config_error(max_bytes):
    catalog = FakeCatalog()
    s3 = FakeS3()

    with pytest.raises(RuntimeError, match="MAX_MEDIA_BYTES"):
        service._presign_image(
            identity(),
            catalog_item(),
            presign_request(),
            catalog,
            s3,
            "la-media",
            "image-1",
            max_bytes,
        )

    assert s3.presign_calls == []
    assert catalog.update_calls == []


def test_presign_rejects_size_over_runtime_maximum_before_signing():
    catalog = FakeCatalog()
    s3 = FakeS3()

    with pytest.raises(BadRequest) as caught:
        service._presign_image(
            identity(),
            catalog_item(),
            presign_request(size_bytes=2049),
            catalog,
            s3,
            "la-media",
            "image-1",
            2048,
        )

    assert caught.value.code == "IMAGE_TOO_LARGE"
    assert s3.presign_calls == []
    assert catalog.update_calls == []


def test_presign_rejects_another_seller_before_signing():
    catalog = FakeCatalog()
    s3 = FakeS3()

    with pytest.raises(Forbidden):
        service._presign_image(
            identity(),
            catalog_item(seller_sub="other-sub"),
            presign_request(),
            catalog,
            s3,
            "la-media",
            "image-1",
            4096,
        )

    assert s3.presign_calls == []
    assert catalog.update_calls == []


def test_presign_rejects_bidder_even_when_item_subject_matches():
    with pytest.raises(Forbidden):
        service._presign_image(
            identity("trusted-sub", "BIDDER"),
            catalog_item(),
            presign_request(),
            FakeCatalog(),
            FakeS3(),
            "la-media",
            "image-1",
            4096,
        )


def test_presign_allows_admin_and_still_uses_items_trusted_seller():
    catalog = FakeCatalog()
    s3 = FakeS3()

    service._presign_image(
        identity("admin-sub", "ADMIN"),
        catalog_item(seller_sub="actual-owner"),
        presign_request(seller_sub="forged-sub"),
        catalog,
        s3,
        "la-media",
        "image-1",
        4096,
    )

    assert s3.presign_calls[0]["Key"] == "items/actual-owner/i1/image-1.png"


def test_presign_requires_waiting_item_before_signing():
    catalog = FakeCatalog()
    s3 = FakeS3()

    with pytest.raises(Conflict) as caught:
        service._presign_image(
            identity(),
            catalog_item(status="LIVE"),
            presign_request(),
            catalog,
            s3,
            "la-media",
            "image-1",
            4096,
        )

    assert caught.value.code == "ITEM_NOT_WAITING"
    assert s3.presign_calls == []


@pytest.mark.parametrize(
    ("field", "unsafe_value"),
    [
        ("item_id", "../item"),
        ("item_id", "item/child"),
        ("seller_sub", "seller\\child"),
        ("seller_sub", "seller\x00child"),
        ("object_id", "../image"),
        ("object_id", "image/child"),
        ("object_id", "image\\child"),
        ("object_id", "."),
    ],
)
def test_presign_rejects_unsafe_key_segments_before_signing(field, unsafe_value):
    item = catalog_item()
    object_id = "image-1"
    if field == "object_id":
        object_id = unsafe_value
    else:
        item[field] = unsafe_value
    catalog = FakeCatalog()
    s3 = FakeS3()

    with pytest.raises(BadRequest):
        service._presign_image(
            identity(),
            item,
            presign_request(),
            catalog,
            s3,
            "la-media",
            object_id,
            4096,
        )

    assert s3.presign_calls == []
    assert catalog.update_calls == []


def test_presign_conditionally_appends_key_with_owner_status_version_and_limit(
    monkeypatch,
):
    monkeypatch.setattr(service.time, "time", lambda: 1_700_000_100)
    item = catalog_item(image_keys=["items/trusted-sub/i1/old.jpg"], version=4)
    catalog = FakeCatalog()

    service._presign_image(
        identity(),
        item,
        presign_request(),
        catalog,
        FakeS3(),
        "la-media",
        "image-2",
        4096,
    )

    assert catalog.update_calls == [
        {
            "Key": item_key("s1", 3, "i1"),
            "UpdateExpression": (
                "SET image_keys = list_append(if_not_exists(image_keys, :empty), "
                ":object_keys), version = version + :one, updated_at = :now"
            ),
            "ConditionExpression": (
                "seller_sub = :seller AND #status = :waiting "
                "AND version = :expected AND "
                "(attribute_not_exists(image_keys) OR size(image_keys) < :max_images)"
            ),
            "ExpressionAttributeNames": {"#status": "status"},
            "ExpressionAttributeValues": {
                ":empty": [],
                ":object_keys": ["items/trusted-sub/i1/image-2.png"],
                ":one": 1,
                ":now": 1_700_000_100,
                ":seller": "trusted-sub",
                ":waiting": "WAITING",
                ":expected": 4,
                ":max_images": 5,
            },
        }
    ]


def test_presign_rejects_known_image_limit_before_signing():
    catalog = FakeCatalog()
    s3 = FakeS3()

    with pytest.raises(Conflict) as caught:
        service._presign_image(
            identity(),
            catalog_item(image_keys=[f"key-{index}" for index in range(5)]),
            presign_request(),
            catalog,
            s3,
            "la-media",
            "image-6",
            4096,
        )

    assert caught.value.code == "IMAGE_LIMIT_REACHED"
    assert s3.presign_calls == []


def test_presign_maps_conditional_append_to_limit_after_reread():
    updated = catalog_item(image_keys=[f"key-{index}" for index in range(5)], version=5)
    catalog = FakeCatalog(
        lookup=lookup_record(),
        base_item=updated,
        update_error=client_error("ConditionalCheckFailedException", "UpdateItem"),
    )

    with pytest.raises(Conflict) as caught:
        service._presign_image(
            identity(),
            catalog_item(version=4),
            presign_request(),
            catalog,
            FakeS3(),
            "la-media",
            "image-2",
            4096,
        )

    assert caught.value.code == "IMAGE_LIMIT_REACHED"
    assert len(catalog.get_calls) == 2


def test_presign_maps_conditional_append_to_changed_after_reread():
    changed = catalog_item(image_keys=["other-key"], version=5)
    catalog = FakeCatalog(
        lookup=lookup_record(),
        base_item=changed,
        update_error=client_error("ConditionalCheckFailedException", "UpdateItem"),
    )

    with pytest.raises(Conflict) as caught:
        service._presign_image(
            identity(),
            catalog_item(version=4),
            presign_request(),
            catalog,
            FakeS3(),
            "la-media",
            "image-2",
            4096,
        )

    assert caught.value.code == "IMAGE_CHANGED"
    assert len(catalog.get_calls) == 2


def test_presign_maps_disappeared_item_during_conditional_reread_to_changed():
    catalog = FakeCatalog(
        update_error=client_error("ConditionalCheckFailedException", "UpdateItem"),
    )

    with pytest.raises(Conflict) as caught:
        service._presign_image(
            identity(),
            catalog_item(version=4),
            presign_request(),
            catalog,
            FakeS3(),
            "la-media",
            "image-2",
            4096,
        )

    assert caught.value.code == "IMAGE_CHANGED"


def test_presign_reraises_unexpected_append_error():
    error = client_error("ProvisionedThroughputExceededException", "UpdateItem")
    catalog = FakeCatalog(update_error=error)

    with pytest.raises(ClientError) as caught:
        service._presign_image(
            identity(),
            catalog_item(),
            presign_request(),
            catalog,
            FakeS3(),
            "la-media",
            "image-1",
            4096,
        )

    assert caught.value is error


def test_presign_does_not_log_url_or_form_fields(caplog):
    s3 = FakeS3(
        result={
            "url": "https://secret.example/upload?signature=do-not-log",
            "fields": {"policy": "do-not-log-policy", "signature": "secret"},
        }
    )

    with caplog.at_level(logging.DEBUG):
        result = service._presign_image(
            identity(),
            catalog_item(),
            presign_request(),
            FakeCatalog(),
            s3,
            "la-media",
            "image-1",
            4096,
        )

    assert result["url"].startswith("https://secret.example")
    assert "do-not-log" not in caplog.text
    assert "do-not-log-policy" not in caplog.text


def test_create_item_route_uses_trusted_claims_and_returns_201(monkeypatch):
    catalog = FakeCatalog(session=session(), rules={**rules_key("s1")})
    monkeypatch.setattr(service, "_catalog_table", lambda: catalog)
    monkeypatch.setattr(service.uuid, "uuid4", lambda: "i1")
    monkeypatch.setattr(service.time, "time", lambda: 1_700_000_000)

    response = service.handler(
        rest_event(
            "POST",
            "/api/v1/auction-sessions/s1/items",
            {
                "name": "Lot one",
                "sequence_number": 3,
                "start_price": "100.25",
                "duration_s": 90,
                "seller_sub": "forged-sub",
            },
            sub="trusted-sub",
        ),
        None,
    )

    assert response["statusCode"] == 201
    assert response_body(response) == {
        "status": 201,
        "code": "ITEM_CREATED",
        "message": "Item created",
        "data": {"item_id": "i1", "status": "WAITING", "version": 1},
    }
    item = catalog.meta.client.transact_calls[0]["TransactItems"][3]["Put"]["Item"]
    assert item["seller_sub"] == {"S": "trusted-sub"}


def test_actual_handler_keeps_cors_headers_on_success_and_service_error(monkeypatch):
    monkeypatch.setenv("CORS_ALLOWED_ORIGIN", "https://auction.example.com")
    monkeypatch.setattr(service.uuid, "uuid4", lambda: "cors-item")
    monkeypatch.setattr(service.time, "time", lambda: 1_700_000_000)
    body = {
        "name": "CORS lot",
        "sequence_number": 3,
        "start_price": "100.25",
        "duration_s": 90,
    }

    monkeypatch.setattr(
        service,
        "_catalog_table",
        lambda: FakeCatalog(session=session(), rules={**rules_key("s1")}),
    )
    success = service.handler(
        rest_event("POST", "/api/v1/auction-sessions/s1/items", body),
        None,
    )
    monkeypatch.setattr(
        service,
        "_catalog_table",
        lambda: FakeCatalog(
            session=session(seller_sub="other-sub"),
            rules={**rules_key("s1")},
        ),
    )
    service_error = service.handler(
        rest_event("POST", "/api/v1/auction-sessions/s1/items", body),
        None,
    )

    assert success["statusCode"] == 201
    assert service_error["statusCode"] == 403
    assert_cors_headers(success)
    assert_cors_headers(service_error)


def test_presign_route_finds_item_and_returns_200(monkeypatch):
    catalog = FakeCatalog(lookup=lookup_record(), base_item=catalog_item())
    s3 = FakeS3()
    monkeypatch.setattr(service, "_catalog_table", lambda: catalog)
    monkeypatch.setattr(service, "_s3_client", lambda: s3)
    monkeypatch.setattr(service.uuid, "uuid4", lambda: "image-1")
    monkeypatch.setattr(service.time, "time", lambda: 1_700_000_100)
    monkeypatch.setattr(
        service,
        "get_config",
        lambda: type(
            "Config",
            (),
            {"MEDIA_BUCKET": "la-media", "MAX_MEDIA_BYTES": 4096},
        )(),
    )

    response = service.handler(
        rest_event(
            "POST",
            "/api/v1/auction-items/i1/images/presign",
            {
                "content_type": "image/webp",
                "size_bytes": 4096,
                "seller_sub": "forged-sub",
            },
        ),
        None,
    )

    assert response["statusCode"] == 200
    assert response_body(response) == {
        "status": 200,
        "code": "IMAGE_UPLOAD_PRESIGNED",
        "message": "Image upload authorized",
        "data": {
            "url": "https://media.example/upload?signature=secret",
            "fields": {"policy": "secret-policy"},
            "object_key": "items/trusted-sub/i1/image-1.webp",
            "expires_in": 300,
        },
    }


def test_route_malformed_json_returns_stable_400_without_parser_details(monkeypatch):
    catalog = FakeCatalog(session=session(), rules={**rules_key("s1")})
    monkeypatch.setattr(service, "_catalog_table", lambda: catalog)
    event = rest_event("POST", "/api/v1/auction-sessions/s1/items", {})
    event["body"] = '{"name": "Broken"'

    response = service.handler(event, None)

    assert response["statusCode"] == 400
    assert response_body(response) == {
        "status": 400,
        "code": "INVALID_JSON",
        "message": "Request body must be valid JSON",
        "data": None,
    }
    assert "Expecting" not in response["body"]
    assert catalog.meta.client.transact_calls == []


def test_route_validation_error_returns_stable_400(monkeypatch):
    catalog = FakeCatalog(session=session(), rules={**rules_key("s1")})
    monkeypatch.setattr(service, "_catalog_table", lambda: catalog)

    response = service.handler(
        rest_event(
            "POST",
            "/api/v1/auction-sessions/s1/items",
            {
                "name": " ",
                "sequence_number": 3,
                "start_price": "100.25",
                "duration_s": 90,
            },
        ),
        None,
    )

    assert response["statusCode"] == 400
    assert response_body(response)["code"] == "VALIDATION_ERROR"
    assert catalog.meta.client.transact_calls == []


def test_route_service_error_returns_real_status(monkeypatch):
    catalog = FakeCatalog(
        session=session(seller_sub="other-sub"), rules={**rules_key("s1")}
    )
    monkeypatch.setattr(service, "_catalog_table", lambda: catalog)

    response = service.handler(
        rest_event(
            "POST",
            "/api/v1/auction-sessions/s1/items",
            {
                "name": "Denied",
                "sequence_number": 3,
                "start_price": "100.25",
                "duration_s": 90,
            },
        ),
        None,
    )

    assert response["statusCode"] == 403
    assert response_body(response)["code"] == "FORBIDDEN"


def test_route_unexpected_aws_error_is_generic_500_without_aws_details(monkeypatch):
    catalog = FakeCatalog(
        session=session(),
        rules={**rules_key("s1")},
        transaction_error=client_error(
            "ProvisionedThroughputExceededException",
            "TransactWriteItems",
            message="secret AWS table information",
        ),
    )
    monkeypatch.setattr(service, "_catalog_table", lambda: catalog)
    monkeypatch.setattr(service.uuid, "uuid4", lambda: "i1")
    monkeypatch.setattr(service.time, "time", lambda: 1_700_000_000)

    response = service.handler(
        rest_event(
            "POST",
            "/api/v1/auction-sessions/s1/items",
            {
                "name": "Retry later",
                "sequence_number": 3,
                "start_price": "100.25",
                "duration_s": 90,
            },
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
    assert "secret AWS table information" not in response["body"]


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/api/v1/auction-items/i1"),
        ("GET", "/api/v1/categories"),
        ("POST", "/api/v1/categories"),
    ],
)
def test_item_service_does_not_register_get_or_category_routes(method, path):
    response = service.handler(rest_event(method, path, {}), None)

    assert response["statusCode"] == 404


def test_handler_delegates_to_app_resolve(monkeypatch):
    sentinel = {"statusCode": 204}
    calls = []

    def resolve(event, context):
        calls.append((event, context))
        return sentinel

    monkeypatch.setattr(service.app, "resolve", resolve)
    event = {"event": "value"}
    context = object()

    assert service.handler(event, context) is sentinel
    assert calls == [(event, context)]
