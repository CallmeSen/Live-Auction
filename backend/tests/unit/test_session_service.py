import json
from decimal import Decimal

import pytest
from botocore.exceptions import ClientError

from auction_common.catalog import rules_key, serialize_item, serialize_values, session_key
from auction_common.http import Conflict, Forbidden, NotFound, RequestIdentity
from auction_common.models import ControlPlaneRules, CreateSessionRequest
from functions.session_service import handler as service


_MISSING = object()


def client_error(
    code,
    operation="DynamoOperation",
    message="AWS internal detail",
    cancellation_reasons=_MISSING,
):
    response = {"Error": {"Code": code, "Message": message}}
    if cancellation_reasons is not _MISSING:
        response["CancellationReasons"] = cancellation_reasons
    return ClientError(response, operation)


class FakeClient:
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

    def __init__(self, session=None, put_error=None, transaction_error=None):
        self.session = session
        self.put_error = put_error
        self.put_calls = []
        self.get_calls = []
        self.meta = FakeMeta(FakeClient(transaction_error))
        self._transaction_client = self.meta.client

    def put_item(self, **kwargs):
        self.put_calls.append(kwargs)
        if self.put_error:
            raise self.put_error

    def get_item(self, **kwargs):
        self.get_calls.append(kwargs)
        return {"Item": self.session} if self.session is not None else {}


def identity(sub="trusted-sub", *groups):
    return RequestIdentity(
        sub=sub, groups=frozenset(groups or ("USER",)), claims={}
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


def test_create_session_uses_trusted_identity_and_writes_complete_item():
    catalog = FakeCatalog()
    request = CreateSessionRequest.model_validate(
        {
            "title": " Evening sale ",
            "description": "Fine art",
            "seller_sub": "forged-sub",
        }
    )

    result = service._create_session(
        identity(), request, catalog, session_id="s1", now=1_700_000_000
    )

    assert result == {"session_id": "s1", "status": "DRAFT"}
    assert catalog.put_calls == [
        {
            "Item": {
                "pk": "SESSION#s1",
                "sk": "META",
                "entity_type": "SESSION",
                "session_id": "s1",
                "seller_sub": "trusted-sub",
                "title": "Evening sale",
                "description": "Fine art",
                "status": "DRAFT",
                "review_status": "PENDING",
                "version": 1,
                "item_count": 0,
                "gsi1pk": "SELLER#trusted-sub",
                "gsi1sk": "SESSION#1700000000#s1",
                "gsi2pk": "SESSION",
                "gsi2sk": "STATUS#DRAFT#START#0000000000#s1",
                "created_at": 1_700_000_000,
                "updated_at": 1_700_000_000,
            },
            "ConditionExpression": "attribute_not_exists(pk)",
        }
    ]


def test_bidder_cannot_create_session():
    catalog = FakeCatalog()

    with pytest.raises(Forbidden):
        service._create_session(
            identity("bidder-sub", "BIDDER"),
            CreateSessionRequest(title="Denied"),
            catalog,
            session_id="s1",
            now=1_700_000_000,
        )

    assert catalog.put_calls == []


def test_user_can_create_session():
    catalog = FakeCatalog()

    result = service._create_session(
        identity("user-sub", "USER"),
        CreateSessionRequest(title="User sale"),
        catalog,
        session_id="s1",
        now=1_700_000_000,
    )

    assert result == {"session_id": "s1", "status": "DRAFT"}
    assert catalog.put_calls[0]["Item"]["seller_sub"] == "user-sub"


def test_admin_can_create_session():
    catalog = FakeCatalog()

    result = service._create_session(
        identity("admin-sub", "ADMIN"),
        CreateSessionRequest(title="Admin sale"),
        catalog,
        session_id="s1",
        now=1_700_000_000,
    )

    assert result == {"session_id": "s1", "status": "DRAFT"}
    assert catalog.put_calls[0]["Item"]["seller_sub"] == "admin-sub"


def test_create_session_maps_identifier_collision_to_stable_conflict():
    catalog = FakeCatalog(
        put_error=client_error("ConditionalCheckFailedException", "PutItem")
    )

    with pytest.raises(Conflict) as caught:
        service._create_session(
            identity(),
            CreateSessionRequest(title="Collision"),
            catalog,
            session_id="s1",
            now=1_700_000_000,
        )

    assert caught.value.code == "SESSION_ID_CONFLICT"


def test_create_session_reraises_unexpected_client_error():
    error = client_error("ProvisionedThroughputExceededException", "PutItem")

    with pytest.raises(ClientError) as caught:
        service._create_session(
            identity(),
            CreateSessionRequest(title="Retry later"),
            FakeCatalog(put_error=error),
            session_id="s1",
            now=1_700_000_000,
        )

    assert caught.value is error


def test_put_rules_strongly_reads_session_meta():
    catalog = FakeCatalog(
        {"seller_sub": "trusted-sub", "status": "DRAFT", "version": 4}
    )

    service._put_rules(
        "s1", identity(), ControlPlaneRules(), catalog, now=1_700_000_100
    )

    assert catalog.get_calls == [
        {"Key": {"pk": "SESSION#s1", "sk": "META"}, "ConsistentRead": True}
    ]


def test_put_rules_rejects_missing_session():
    with pytest.raises(NotFound) as caught:
        service._put_rules("missing", identity(), ControlPlaneRules(), FakeCatalog())

    assert caught.value.code == "SESSION_NOT_FOUND"


def test_seller_cannot_update_another_sellers_rules():
    catalog = FakeCatalog(
        {"seller_sub": "other-sub", "status": "DRAFT", "version": 1}
    )

    with pytest.raises(Forbidden):
        service._put_rules("s1", identity(), ControlPlaneRules(), catalog)

    assert catalog.meta.client.transact_calls == []


def test_bidder_cannot_update_rules():
    catalog = FakeCatalog(
        {"seller_sub": "bidder-sub", "status": "DRAFT", "version": 1}
    )

    with pytest.raises(Forbidden):
        service._put_rules(
            "s1",
            identity("bidder-sub", "BIDDER"),
            ControlPlaneRules(),
            catalog,
        )

    assert catalog.get_calls == []


def test_admin_can_update_another_sellers_rules():
    catalog = FakeCatalog(
        {"seller_sub": "other-sub", "status": "DRAFT", "version": 6}
    )

    result = service._put_rules(
        "s1",
        identity("admin-sub", "ADMIN"),
        ControlPlaneRules(),
        catalog,
        now=1_700_000_100,
    )

    assert result == {"session_id": "s1", "version": 7}
    update = catalog.meta.client.transact_calls[0]["TransactItems"][1]["Update"]
    assert "seller_sub" not in update["ConditionExpression"]
    assert ":seller" not in update["ExpressionAttributeValues"]


def test_put_rules_rejects_non_draft_session():
    catalog = FakeCatalog(
        {"seller_sub": "trusted-sub", "status": "SCHEDULED", "version": 1}
    )

    with pytest.raises(Conflict) as caught:
        service._put_rules("s1", identity(), ControlPlaneRules(), catalog)

    assert caught.value.code == "SESSION_NOT_DRAFT"
    assert catalog.meta.client.transact_calls == []


def test_put_rules_writes_rules_and_updates_meta_in_one_transaction():
    catalog = FakeCatalog(
        {"seller_sub": "trusted-sub", "status": "DRAFT", "version": 8}
    )
    rules = ControlPlaneRules(
        min_increment=Decimal("2.50"),
        max_increment=Decimal("250.00"),
        anti_snipe_window_s=45,
        anti_snipe_extend_s=75,
        max_extensions=4,
        public_history_limit=30,
    )

    result = service._put_rules(
        "s1",
        identity(),
        rules,
        catalog,
        expected_version=8,
        now=1_700_000_100,
    )

    expected_rules = {
        **rules_key("s1"),
        **rules.model_dump(),
        "entity_type": "SESSION_RULES",
        "session_id": "s1",
        "version": 9,
        "updated_at": 1_700_000_100,
    }
    assert result == {"session_id": "s1", "version": 9}
    assert catalog.meta.client.transact_calls == [
        {
            "TransactItems": [
                {
                    "Put": {
                        "TableName": "auction-catalog",
                        "Item": serialize_item(expected_rules),
                    }
                },
                {
                    "Update": {
                        "TableName": "auction-catalog",
                        "Key": serialize_item(session_key("s1")),
                        "UpdateExpression": (
                            "SET version = :next_version, updated_at = :updated_at"
                        ),
                        "ConditionExpression": (
                            "#status = :draft AND version = :expected "
                            "AND seller_sub = :seller"
                        ),
                        "ExpressionAttributeNames": {"#status": "status"},
                        "ExpressionAttributeValues": serialize_values(
                            {
                                ":next_version": 9,
                                ":updated_at": 1_700_000_100,
                                ":draft": "DRAFT",
                                ":expected": 8,
                                ":seller": "trusted-sub",
                            }
                        ),
                    }
                },
            ]
        }
    ]


def test_put_rules_maps_direct_conditional_failure_to_session_changed():
    catalog = FakeCatalog(
        {"seller_sub": "trusted-sub", "status": "DRAFT", "version": 1},
        transaction_error=client_error(
            "ConditionalCheckFailedException", "TransactWriteItems"
        ),
    )

    with pytest.raises(Conflict) as caught:
        service._put_rules(
            "s1",
            identity(),
            ControlPlaneRules(),
            catalog,
            now=1_700_000_100,
        )

    assert caught.value.code == "SESSION_CHANGED"


def test_put_rules_maps_conditional_transaction_cancellation_to_session_changed():
    catalog = FakeCatalog(
        {"seller_sub": "trusted-sub", "status": "DRAFT", "version": 1},
        transaction_error=client_error(
            "TransactionCanceledException",
            "TransactWriteItems",
            cancellation_reasons=[
                {"Code": "None"},
                {"Code": "ConditionalCheckFailed"},
            ],
        ),
    )

    with pytest.raises(Conflict) as caught:
        service._put_rules(
            "s1", identity(), ControlPlaneRules(), catalog, now=1_700_000_100
        )

    assert caught.value.code == "SESSION_CHANGED"


@pytest.mark.parametrize(
    "cancellation_reasons",
    [
        pytest.param(
            [{"Code": "ProvisionedThroughputExceeded"}], id="throughput"
        ),
        pytest.param([{"Code": "TransactionConflict"}], id="transaction-conflict"),
        pytest.param([{"Code": "None"}], id="none-code"),
        pytest.param([], id="empty-reasons"),
        pytest.param(None, id="null-reasons"),
        pytest.param(_MISSING, id="missing-reasons"),
    ],
)
def test_put_rules_reraises_nonconditional_transaction_cancellation(
    cancellation_reasons,
):
    error = client_error(
        "TransactionCanceledException",
        "TransactWriteItems",
        cancellation_reasons=cancellation_reasons,
    )
    catalog = FakeCatalog(
        {"seller_sub": "trusted-sub", "status": "DRAFT", "version": 1},
        transaction_error=error,
    )

    with pytest.raises(ClientError) as caught:
        service._put_rules(
            "s1", identity(), ControlPlaneRules(), catalog, now=1_700_000_100
        )

    assert caught.value is error


def test_put_rules_reraises_unexpected_client_error():
    error = client_error("ProvisionedThroughputExceededException", "TransactWriteItems")
    catalog = FakeCatalog(
        {"seller_sub": "trusted-sub", "status": "DRAFT", "version": 1},
        transaction_error=error,
    )

    with pytest.raises(ClientError) as caught:
        service._put_rules(
            "s1", identity(), ControlPlaneRules(), catalog, now=1_700_000_100
        )

    assert caught.value is error


def test_post_route_uses_authorizer_claims_and_returns_stable_201(
    monkeypatch,
):
    catalog = FakeCatalog()
    monkeypatch.setattr(service, "_catalog_table", lambda: catalog)
    monkeypatch.setattr(service.uuid, "uuid4", lambda: "route-session")
    monkeypatch.setattr(service.time, "time", lambda: 1_700_000_000)
    event = rest_event(
        "POST",
        "/api/v1/auction-sessions",
        {"title": "Route sale", "seller_sub": "forged-sub"},
        sub="authorizer-sub",
    )

    response = service.handler(event, None)

    assert response["statusCode"] == 201
    assert response_body(response) == {
        "status": 201,
        "code": "SESSION_CREATED",
        "message": "Session created",
        "data": {"session_id": "route-session", "status": "DRAFT"},
    }
    assert catalog.put_calls[0]["Item"]["seller_sub"] == "authorizer-sub"


def test_actual_handler_keeps_cors_headers_on_success_and_service_error(monkeypatch):
    monkeypatch.setenv("CORS_ALLOWED_ORIGIN", "https://auction.example.com")
    monkeypatch.setattr(service, "_catalog_table", lambda: FakeCatalog())
    monkeypatch.setattr(service.uuid, "uuid4", lambda: "cors-session")
    monkeypatch.setattr(service.time, "time", lambda: 1_700_000_000)

    success = service.handler(
        rest_event("POST", "/api/v1/auction-sessions", {"title": "CORS sale"}),
        None,
    )
    service_error = service.handler(
        rest_event(
            "POST",
            "/api/v1/auction-sessions",
            {"title": "Denied"},
            groups="BIDDER",
        ),
        None,
    )

    assert success["statusCode"] == 201
    assert service_error["statusCode"] == 403
    assert_cors_headers(success)
    assert_cors_headers(service_error)


def test_put_route_uses_authorizer_claims_and_returns_stable_200(monkeypatch):
    catalog = FakeCatalog(
        {"seller_sub": "authorizer-sub", "status": "DRAFT", "version": 2}
    )
    monkeypatch.setattr(service, "_catalog_table", lambda: catalog)
    monkeypatch.setattr(service.time, "time", lambda: 1_700_000_100)
    event = rest_event(
        "PUT",
        "/api/v1/auction-sessions/s1/rules",
        {"min_increment": "5.00", "seller_sub": "forged-sub"},
        sub="authorizer-sub",
    )

    response = service.handler(event, None)

    assert response["statusCode"] == 200
    assert response_body(response) == {
        "status": 200,
        "code": "SESSION_RULES_UPDATED",
        "message": "Session rules updated",
        "data": {"session_id": "s1", "version": 3},
    }
    update = catalog.meta.client.transact_calls[0]["TransactItems"][1]["Update"]
    assert update["ExpressionAttributeValues"][":seller"] == {"S": "authorizer-sub"}


def test_route_validation_error_is_a_stable_400(monkeypatch):
    catalog = FakeCatalog()
    monkeypatch.setattr(service, "_catalog_table", lambda: catalog)

    response = service.handler(
        rest_event("POST", "/api/v1/auction-sessions", {"title": "   "}),
        None,
    )

    assert response["statusCode"] == 400
    assert response_body(response) == {
        "status": 400,
        "code": "VALIDATION_ERROR",
        "message": "Request validation failed",
        "data": None,
    }
    assert catalog.put_calls == []


def test_post_route_malformed_json_is_a_stable_400(monkeypatch):
    catalog = FakeCatalog()
    monkeypatch.setattr(service, "_catalog_table", lambda: catalog)
    event = rest_event("POST", "/api/v1/auction-sessions", {})
    event["body"] = '{"title": "Broken"'

    response = service.handler(event, None)

    assert response["statusCode"] == 400
    assert response_body(response) == {
        "status": 400,
        "code": "INVALID_JSON",
        "message": "Request body must be valid JSON",
        "data": None,
    }
    assert "Expecting" not in response["body"]
    assert catalog.put_calls == []


def test_route_forbidden_error_is_a_real_403(monkeypatch):
    catalog = FakeCatalog()
    monkeypatch.setattr(service, "_catalog_table", lambda: catalog)

    response = service.handler(
        rest_event(
            "POST",
            "/api/v1/auction-sessions",
            {"title": "Denied"},
            sub="bidder-sub",
            groups="BIDDER",
        ),
        None,
    )

    assert response["statusCode"] == 403
    assert response_body(response) == {
        "status": 403,
        "code": "FORBIDDEN",
        "message": "Permission denied",
        "data": None,
    }
    assert catalog.put_calls == []


def test_route_unexpected_aws_error_is_a_generic_500(monkeypatch):
    catalog = FakeCatalog(
        put_error=client_error(
            "ProvisionedThroughputExceededException",
            "PutItem",
            message="sensitive AWS exception text",
        )
    )
    monkeypatch.setattr(service, "_catalog_table", lambda: catalog)
    monkeypatch.setattr(service.uuid, "uuid4", lambda: "route-session")
    monkeypatch.setattr(service.time, "time", lambda: 1_700_000_000)

    response = service.handler(
        rest_event("POST", "/api/v1/auction-sessions", {"title": "Retry later"}),
        None,
    )

    assert response["statusCode"] == 500
    assert response_body(response) == {
        "status": 500,
        "code": "INTERNAL_ERROR",
        "message": "Internal server error",
        "data": None,
    }
    assert "sensitive AWS exception text" not in response["body"]
