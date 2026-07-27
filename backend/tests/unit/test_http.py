import json
from dataclasses import FrozenInstanceError
from decimal import Decimal

import pytest

from auction_common.http import (
    BadRequest,
    Conflict,
    Forbidden,
    NotFound,
    RequestIdentity,
    ServiceError,
    Unauthorized,
    identity_from_event,
    json_response,
    require_group,
)


def rest_event(sub="seller-sub", groups="SELLER"):
    return {
        "requestContext": {
            "authorizer": {
                "claims": {"sub": sub, "cognito:groups": groups},
            }
        }
    }


def test_service_errors_store_stable_http_contract():
    cases = (
        (Unauthorized(), 401, "UNAUTHORIZED", "Authentication is required"),
        (Forbidden(), 403, "FORBIDDEN", "Permission denied"),
        (BadRequest("INVALID_BODY", "Body is invalid"), 400, "INVALID_BODY", "Body is invalid"),
        (NotFound("ITEM_NOT_FOUND", "Item was not found"), 404, "ITEM_NOT_FOUND", "Item was not found"),
        (Conflict("ITEM_EXISTS", "Item already exists"), 409, "ITEM_EXISTS", "Item already exists"),
    )

    for error, status_code, code, message in cases:
        assert isinstance(error, ServiceError)
        assert error.status_code == status_code
        assert error.code == code
        assert error.message == message
        assert str(error) == message


def test_request_identity_is_frozen_and_uses_slots():
    identity = RequestIdentity(sub="seller-sub", groups=frozenset({"SELLER"}))

    with pytest.raises(FrozenInstanceError):
        identity.sub = "forged-sub"

    assert not hasattr(identity, "__dict__")


@pytest.mark.parametrize(
    ("claim", "expected"),
    [
        (["SELLER", "BIDDER"], frozenset({"SELLER", "BIDDER"})),
        ("[SELLER, BIDDER]", frozenset({"SELLER", "BIDDER"})),
        ("SELLER,BIDDER", frozenset({"SELLER", "BIDDER"})),
        (" SELLER, SELLER, BIDDER ", frozenset({"SELLER", "BIDDER"})),
        (None, frozenset()),
    ],
)
def test_identity_uses_authorizer_claims_and_normalizes_groups(claim, expected):
    event = rest_event(groups=claim)
    event["sub"] = "forged-top-level-sub"
    event["requestContext"]["authorizer"]["sub"] = "forged-authorizer-sub"

    identity = identity_from_event(event)

    assert identity.sub == "seller-sub"
    assert identity.groups == expected


@pytest.mark.parametrize(
    "event",
    [{}, rest_event(sub=None), rest_event(sub=""), rest_event(sub="   ")],
)
def test_identity_rejects_missing_or_blank_trusted_subject(event):
    with pytest.raises(Unauthorized) as exc_info:
        identity_from_event(event)

    assert exc_info.value.code == "UNAUTHORIZED"


@pytest.mark.parametrize("event", [None, [], "forged-event"])
def test_identity_rejects_non_mapping_events(event):
    with pytest.raises(Unauthorized) as exc_info:
        identity_from_event(event)

    assert exc_info.value.code == "UNAUTHORIZED"


def test_require_group_allows_an_allowed_group_or_admin():
    require_group(identity_from_event(rest_event(groups="SELLER")), "SELLER")
    require_group(identity_from_event(rest_event(groups="ADMIN")), "SELLER")


def test_require_group_rejects_identity_without_an_allowed_group():
    identity = identity_from_event(rest_event(groups="BIDDER"))

    with pytest.raises(Forbidden) as exc_info:
        require_group(identity, "SELLER", "ADMIN_SUPPORT")

    assert exc_info.value.code == "FORBIDDEN"


def test_json_response_has_stable_proxy_shape_and_serializes_safe_values():
    response = json_response(
        200,
        "ITEM_FOUND",
        "Item found",
        {"amount": Decimal("10.25")},
    )

    assert response == {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": (
            '{"status": 200, "code": "ITEM_FOUND", "message": "Item found", '
            '"data": {"amount": "10.25"}}'
        ),
    }
    assert json.loads(response["body"])["data"] == {"amount": "10.25"}


def test_json_response_adds_configured_browser_cors_headers(monkeypatch):
    monkeypatch.setenv("CORS_ALLOWED_ORIGIN", "https://auction.example.com")

    response = json_response(200, "OK", "Request succeeded")

    assert response["headers"] == {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "https://auction.example.com",
        "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Api-Key",
        "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    }


@pytest.mark.parametrize(
    "unsafe_origin",
    ["*", "null", "https://auction.example.com\r\nX-Injected: true"],
)
def test_json_response_never_emits_an_unsafe_cors_origin(monkeypatch, unsafe_origin):
    monkeypatch.setenv("CORS_ALLOWED_ORIGIN", unsafe_origin)

    response = json_response(200, "OK", "Request succeeded")

    assert "Access-Control-Allow-Origin" not in response["headers"]
    assert set(response["headers"]) == {"Content-Type"}
