import json
import os
from decimal import Decimal
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from boto3.dynamodb.types import TypeDeserializer
from botocore.exceptions import ClientError

import functions.ws_handler.handler as module


CFG = SimpleNamespace(
    REGION="ap-southeast-2",
    OWNER_REGION="ap-southeast-2",
    T_STATE="state-table",
    T_EVENTS="events-table",
    T_CONN="connections-table",
    T_ALIAS="aliases-table",
    T_IDEMPOTENCY="idempotency-table",
    BID_QUEUE_URL="https://sqs.example/bids.fifo",
    WS_ENDPOINT="",
    BROADCAST_FN="",
    DB_SECRET_ARN="",
    RDS_PROXY_HOST="",
)
AUTH_ITEM_ID = "__connection_auth__"


def route_event(
    connection_id="connection-1",
    route="$disconnect",
    *,
    authorizer=None,
    body=None,
):
    request_context = {
        "connectionId": connection_id,
        "routeKey": route,
        "domainName": "socket.example.test",
        "stage": "prod",
    }
    if authorizer is not None:
        request_context["authorizer"] = authorizer
    event = {"requestContext": request_context}
    if body is not None:
        event["body"] = body if isinstance(body, str) else json.dumps(body)
    return event


def connect_event(authorizer=None):
    return route_event(
        route="$connect",
        authorizer=authorizer,
    )


def message_event(route, payload, *, authorizer=None):
    body = {"action": route, **payload}
    return route_event(route=route, authorizer=authorizer, body=body)


def auth_record(**overrides):
    record = {
        "item_id": AUTH_ITEM_ID,
        "connection_id": "connection-1",
        "record_type": "AUTH",
        "user_sub": "real-user",
        "email": "real-user@example.test",
        "role": "BIDDER",
        "current_item_id": "item-1",
        "session_revision": "revision-1",
        "ttl": 9_999,
    }
    record.update(overrides)
    return record


def deserialize(values):
    deserializer = TypeDeserializer()
    return {key: deserializer.deserialize(value) for key, value in values.items()}


@pytest.fixture(autouse=True)
def configured_handler(monkeypatch):
    monkeypatch.setattr(module, "get_config", lambda: CFG)
    original_ack = module._ack
    monkeypatch.setattr(module, "_ack", Mock())
    yield original_ack


def test_connect_persists_trusted_auth_record_with_reserved_key_and_two_hour_ttl(
    monkeypatch,
):
    connections = Mock()
    monkeypatch.setattr(module, "table", lambda name: connections)
    monkeypatch.setattr(module.time, "time", lambda: 1_000)
    monkeypatch.setattr(
        module, "uuid4", lambda: SimpleNamespace(hex="revision-connect")
    )
    event = connect_event(
        {
            "sub": "user-1",
            "email": "user-1@example.test",
            "role": "BIDDER",
            "token": "must-not-be-stored",
        }
    )

    response = module._handle(event)

    assert response["statusCode"] == 200
    connections.put_item.assert_called_once_with(
        Item={
            "item_id": AUTH_ITEM_ID,
            "connection_id": "connection-1",
            "record_type": "AUTH",
            "user_sub": "user-1",
            "email": "user-1@example.test",
            "role": "BIDDER",
            "session_revision": "revision-connect",
            "ttl": 8_200,
        }
    )
    assert "must-not-be-stored" not in json.dumps(response)


@pytest.mark.parametrize("role", ["ADMIN", "SELLER", "BIDDER"])
def test_connect_accepts_only_supported_roles(monkeypatch, role):
    connections = Mock()
    monkeypatch.setattr(module, "table", lambda name: connections)

    response = module._handle(connect_event({"sub": "user-1", "role": role}))

    assert response["statusCode"] == 200
    assert connections.put_item.call_args.kwargs["Item"]["role"] == role


@pytest.mark.parametrize(
    ("authorizer", "status_code"),
    [
        (None, 401),
        ({"role": "BIDDER"}, 401),
        ({"sub": "user-1"}, 401),
        ({"sub": "user-1", "role": "VIEWER"}, 403),
    ],
)
def test_connect_rejects_missing_or_unsupported_authorizer_context(
    monkeypatch, authorizer, status_code
):
    connections = Mock()
    monkeypatch.setattr(module, "table", lambda name: connections)

    response = module._handle(connect_event(authorizer))

    assert response["statusCode"] == status_code
    connections.put_item.assert_not_called()


def test_get_auth_uses_direct_reserved_key_lookup(monkeypatch):
    connections = Mock()
    connections.get_item.return_value = {"Item": auth_record()}
    monkeypatch.setattr(module, "table", lambda name: connections)

    assert module._get_auth("connection-1") == auth_record()
    connections.get_item.assert_called_once_with(
        Key={"item_id": AUTH_ITEM_ID, "connection_id": "connection-1"},
        ConsistentRead=True,
    )
    assert not connections.scan.called
    assert not connections.query.called


def test_replace_room_serializes_old_delete_new_put_and_auth_update(monkeypatch):
    client = Mock()
    monkeypatch.setattr(module, "_ddb_client", lambda: client)
    room = {
        "item_id": "item-new",
        "connection_id": "connection-1",
        "record_type": "ROOM",
        "user_sub": "user-1",
        "bidder_alias": "Bidder #1",
        "session_revision": "revision-new",
        "ttl": 8_200,
    }

    module._replace_room(
        connection_id="connection-1",
        old_item_id="item-old",
        new_item_id="item-new",
        room=room,
        ttl=8_200,
        expected_user_sub="user-1",
        expected_session_revision="revision-old",
    )

    actions = client.transact_write_items.call_args.kwargs["TransactItems"]
    assert len(actions) == 3
    assert actions[0]["Delete"]["TableName"] == CFG.T_CONN
    assert deserialize(actions[0]["Delete"]["Key"]) == {
        "item_id": "item-old",
        "connection_id": "connection-1",
    }
    assert actions[1]["Put"]["TableName"] == CFG.T_CONN
    assert deserialize(actions[1]["Put"]["Item"]) == room
    update = actions[2]["Update"]
    assert update["TableName"] == CFG.T_CONN
    assert deserialize(update["Key"]) == {
        "item_id": AUTH_ITEM_ID,
        "connection_id": "connection-1",
    }
    assert update["UpdateExpression"] == (
        "SET current_item_id = :item, #ttl = :ttl, "
        "session_revision = :new_session_revision"
    )
    assert update["ExpressionAttributeNames"] == {"#ttl": "ttl"}
    assert deserialize(update["ExpressionAttributeValues"]) == {
        ":item": "item-new",
        ":ttl": Decimal("8200"),
        ":expected_user_sub": "user-1",
        ":expected_item": "item-old",
        ":expected_session_revision": "revision-old",
        ":new_session_revision": "revision-new",
    }
    assert update["ConditionExpression"] == (
        "attribute_exists(item_id) AND user_sub = :expected_user_sub "
        "AND session_revision = :expected_session_revision "
        "AND current_item_id = :expected_item"
    )


def test_replace_room_without_previous_room_requires_missing_current_item(
    monkeypatch,
):
    client = Mock()
    monkeypatch.setattr(module, "_ddb_client", lambda: client)

    module._replace_room(
        connection_id="connection-1",
        old_item_id=None,
        new_item_id="item-new",
        room={
            "item_id": "item-new",
            "connection_id": "connection-1",
            "record_type": "ROOM",
            "user_sub": "user-1",
            "bidder_alias": "Bidder #1",
            "session_revision": "revision-new",
            "ttl": 8_200,
        },
        ttl=8_200,
        expected_user_sub="user-1",
        expected_session_revision="revision-old",
    )

    update = client.transact_write_items.call_args.kwargs["TransactItems"][-1][
        "Update"
    ]
    assert update["ConditionExpression"] == (
        "attribute_exists(item_id) AND user_sub = :expected_user_sub "
        "AND session_revision = :expected_session_revision "
        "AND attribute_not_exists(current_item_id)"
    )
    assert deserialize(update["ExpressionAttributeValues"]) == {
        ":item": "item-new",
        ":ttl": Decimal("8200"),
        ":expected_user_sub": "user-1",
        ":expected_session_revision": "revision-old",
        ":new_session_revision": "revision-new",
    }


def test_replace_room_transaction_cancelled_cannot_partially_write_room(
    monkeypatch,
):
    client = Mock()
    client.transact_write_items.side_effect = ClientError(
        {
            "Error": {
                "Code": "TransactionCanceledException",
                "Message": "conditional check failed",
            }
        },
        "TransactWriteItems",
    )
    monkeypatch.setattr(module, "_ddb_client", lambda: client)
    connections = Mock()
    monkeypatch.setattr(module, "table", lambda name: connections)

    with pytest.raises(ClientError) as exc_info:
        module._replace_room(
            connection_id="connection-1",
            old_item_id="item-old",
            new_item_id="item-new",
            room={"item_id": "item-new", "session_revision": "revision-new"},
            ttl=8_200,
            expected_user_sub="user-1",
            expected_session_revision="revision-old",
        )

    assert exc_info.value.response["Error"]["Code"] == (
        "TransactionCanceledException"
    )
    client.transact_write_items.assert_called_once()
    connections.put_item.assert_not_called()
    connections.update_item.assert_not_called()
    connections.delete_item.assert_not_called()


def test_replace_room_does_not_delete_when_rejoining_same_room(monkeypatch):
    client = Mock()
    monkeypatch.setattr(module, "_ddb_client", lambda: client)
    room = {
        "item_id": "item-1",
        "connection_id": "connection-1",
        "record_type": "ROOM",
        "user_sub": "user-1",
        "bidder_alias": "Bidder #1",
        "session_revision": "revision-1",
        "ttl": 8_200,
    }

    module._replace_room(
        connection_id="connection-1",
        old_item_id="item-1",
        new_item_id="item-1",
        room=room,
        ttl=8_200,
        expected_user_sub="user-1",
        expected_session_revision="revision-1",
    )

    actions = client.transact_write_items.call_args.kwargs["TransactItems"]
    assert [next(iter(action)) for action in actions] == ["Put", "Update"]


@pytest.mark.parametrize(
    ("item_response", "expected"),
    [
        ({}, False),
        ({"Item": {"item_id": "item-1", "status": "SCHEDULED"}}, False),
        ({"Item": {"item_id": "item-1", "status": "LIVE"}}, True),
    ],
)
def test_item_is_live_requires_existing_live_state(
    monkeypatch, item_response, expected
):
    state = Mock()
    state.get_item.return_value = item_response
    monkeypatch.setattr(module, "table", lambda name: state)

    assert module._item_is_live("item-1") is expected
    state.get_item.assert_called_once_with(
        Key={"item_id": "item-1"}, ConsistentRead=True
    )


def test_assign_alias_reuses_existing_alias_without_writing(monkeypatch):
    aliases = Mock()
    aliases.get_item.return_value = {
        "Item": {
            "item_id": "item-1",
            "user_id": "user-1",
            "bidder_alias": "Bidder #7",
        }
    }
    monkeypatch.setattr(module, "table", lambda name: aliases)

    assert module._assign_alias("item-1", "user-1") == "Bidder #7"
    aliases.get_item.assert_called_once_with(
        Key={"item_id": "item-1", "user_id": "user-1"},
        ConsistentRead=True,
    )
    aliases.put_item.assert_not_called()


def test_assign_alias_creates_numeric_alias_from_atomic_counter(monkeypatch):
    aliases = Mock()
    aliases.get_item.return_value = {}
    aliases.update_item.return_value = {"Attributes": {"seq": Decimal("7")}}
    monkeypatch.setattr(module, "table", lambda name: aliases)

    alias = module._assign_alias("item-1", "user-1")

    assert alias == "Bidder #7"
    aliases.update_item.assert_called_once_with(
        Key={"item_id": "item-1", "user_id": "__counter__"},
        UpdateExpression="ADD #seq :one",
        ExpressionAttributeNames={"#seq": "seq"},
        ExpressionAttributeValues={":one": 1},
        ReturnValues="UPDATED_NEW",
    )
    aliases.put_item.assert_called_once_with(
        Item={
            "item_id": "item-1",
            "user_id": "user-1",
            "bidder_alias": alias,
        },
        ConditionExpression="attribute_not_exists(user_id)",
    )
    assert not aliases.scan.called
    assert not aliases.query.called


def test_assign_alias_returns_existing_alias_after_conditional_conflict(
    monkeypatch,
):
    aliases = Mock()
    aliases.get_item.side_effect = [
        {},
        {
            "Item": {
                "item_id": "item-1",
                "user_id": "user-1",
                "bidder_alias": "Bidder #8",
            }
        },
    ]
    aliases.update_item.return_value = {"Attributes": {"seq": Decimal("9")}}
    aliases.put_item.side_effect = ClientError(
        {
            "Error": {
                "Code": "ConditionalCheckFailedException",
                "Message": "alias already exists",
            }
        },
        "PutItem",
    )
    monkeypatch.setattr(module, "table", lambda name: aliases)

    assert module._assign_alias("item-1", "user-1") == "Bidder #8"
    assert aliases.get_item.call_count == 2
    aliases.update_item.assert_called_once()
    aliases.put_item.assert_called_once()


def test_join_room_replaces_previous_room_with_stored_identity(monkeypatch):
    monkeypatch.setattr(module.time, "time", lambda: 1_000)
    monkeypatch.setattr(
        module, "uuid4", lambda: SimpleNamespace(hex="revision-new")
    )
    get_auth = Mock(return_value=auth_record(current_item_id="item-old"))
    replace_room = Mock()
    ack = Mock()
    monkeypatch.setattr(module, "_get_auth", get_auth)
    monkeypatch.setattr(module, "_item_is_live", lambda item_id: True)
    monkeypatch.setattr(
        module, "_assign_alias", lambda item_id, user_sub: "Bidder #1"
    )
    monkeypatch.setattr(module, "_replace_room", replace_room)
    monkeypatch.setattr(module, "_ack", ack)
    event = message_event(
        "joinRoom",
        {"item_id": "item-new", "user_sub": "forged-user"},
        authorizer={"sub": "forged-authorizer", "role": "ADMIN"},
    )

    response = module._handle(event)

    assert response["statusCode"] == 200
    get_auth.assert_called_once_with("connection-1")
    replace_room.assert_called_once_with(
        connection_id="connection-1",
        old_item_id="item-old",
        new_item_id="item-new",
        room={
            "item_id": "item-new",
            "connection_id": "connection-1",
            "record_type": "ROOM",
            "user_sub": "real-user",
            "bidder_alias": "Bidder #1",
            "session_revision": "revision-new",
            "ttl": 8_200,
        },
        ttl=8_200,
        expected_user_sub="real-user",
        expected_session_revision="revision-1",
    )
    ack_payload = ack.call_args.args[1]
    assert ack_payload == {
        "type": "room_joined",
        "item_id": "item-new",
        "bidder_alias": "Bidder #1",
    }
    assert "forged" not in json.dumps(ack_payload)


def test_join_room_rejects_non_live_item_before_alias_or_transaction(monkeypatch):
    monkeypatch.setattr(module, "_get_auth", Mock(return_value=auth_record()))
    monkeypatch.setattr(module, "_item_is_live", lambda item_id: False)
    assign_alias = Mock()
    replace_room = Mock()
    monkeypatch.setattr(module, "_assign_alias", assign_alias)
    monkeypatch.setattr(module, "_replace_room", replace_room)

    response = module._handle(message_event("joinRoom", {"item_id": "item-1"}))

    assert response["statusCode"] == 409
    assign_alias.assert_not_called()
    replace_room.assert_not_called()


@pytest.mark.parametrize(
    "item_id",
    [
        None,
        "",
        123,
        AUTH_ITEM_ID,
        "i" * 129,
        "item 1",
        "item/1",
        "item\n1",
        "item.1",
        "\titem",
    ],
)
def test_join_room_rejects_invalid_item_id(monkeypatch, item_id):
    monkeypatch.setattr(module, "_get_auth", Mock(return_value=auth_record()))
    item_is_live = Mock()
    item_is_live.return_value = False
    monkeypatch.setattr(module, "_item_is_live", item_is_live)

    response = module._handle(message_event("joinRoom", {"item_id": item_id}))

    assert 400 <= response["statusCode"] < 500
    item_is_live.assert_not_called()


def test_place_bid_ignores_forged_identity_and_builds_server_command(monkeypatch):
    get_auth = Mock(return_value=auth_record())
    send_sqs = Mock()
    ack = Mock()
    monkeypatch.setattr(module, "_get_auth", get_auth)
    monkeypatch.setattr(module, "_send_sqs", send_sqs)
    monkeypatch.setattr(module, "_ack", ack)
    event = message_event(
        "placeBid",
        {
            "item_id": "item-1",
            "amount": "101.25",
            "request_id": "request-123",
            "user_sub": "forged-user",
            "token": "secret-token",
        },
        authorizer={"sub": "forged-authorizer", "role": "ADMIN"},
    )

    response = module._handle(event)

    assert response["statusCode"] == 202
    get_auth.assert_called_once_with("connection-1")
    send_sqs.assert_called_once_with(
        {
            "item_id": "item-1",
            "amount": Decimal("101.25"),
            "request_id": "request-123",
            "user_sub": "real-user",
            "owner_region": CFG.OWNER_REGION,
            "connection_id": "connection-1",
        }
    )
    assert ack.call_args.args[1] == {
        "type": "bid_queued",
        "item_id": "item-1",
        "request_id": "request-123",
    }
    assert "secret-token" not in json.dumps(response)
    assert "forged" not in json.dumps(response)


def test_place_bid_denies_stored_seller_role(monkeypatch):
    monkeypatch.setattr(
        module, "_get_auth", Mock(return_value=auth_record(role="SELLER"))
    )
    send_sqs = Mock()
    monkeypatch.setattr(module, "_send_sqs", send_sqs)

    response = module._handle(
        message_event(
            "placeBid",
            {
                "item_id": "item-1",
                "amount": "101",
                "request_id": "request-123",
            },
        )
    )

    assert response["statusCode"] == 403
    send_sqs.assert_not_called()


def test_place_bid_denies_item_other_than_stored_current_room(monkeypatch):
    monkeypatch.setattr(module, "_get_auth", Mock(return_value=auth_record()))
    send_sqs = Mock()
    monkeypatch.setattr(module, "_send_sqs", send_sqs)

    response = module._handle(
        message_event(
            "placeBid",
            {
                "item_id": "item-other",
                "amount": "101",
                "request_id": "request-123",
            },
        )
    )

    assert response["statusCode"] == 403
    send_sqs.assert_not_called()


def test_place_bid_rejects_item_id_over_128_characters_before_sqs(monkeypatch):
    item_id = "i" * 129
    monkeypatch.setattr(
        module,
        "_get_auth",
        Mock(return_value=auth_record(current_item_id=item_id)),
    )
    send_sqs = Mock()
    monkeypatch.setattr(module, "_send_sqs", send_sqs)

    response = module._handle(
        message_event(
            "placeBid",
            {
                "item_id": item_id,
                "amount": "101",
                "request_id": "request-123",
            },
        )
    )

    assert response["statusCode"] == 400
    send_sqs.assert_not_called()


@pytest.mark.parametrize("item_id", ["item 1", "item/1", "item\n1", "item.1"])
def test_place_bid_rejects_non_protocol_item_id_before_sqs(monkeypatch, item_id):
    monkeypatch.setattr(
        module,
        "_get_auth",
        Mock(return_value=auth_record(current_item_id=item_id)),
    )
    send_sqs = Mock()
    monkeypatch.setattr(module, "_send_sqs", send_sqs)

    response = module._handle(
        message_event(
            "placeBid",
            {
                "item_id": item_id,
                "amount": "101",
                "request_id": "request-123",
            },
        )
    )

    assert response["statusCode"] == 400
    send_sqs.assert_not_called()


@pytest.mark.parametrize(
    "amount", [None, "", "not-a-number", "0", "-1", "NaN", "Infinity"]
)
def test_place_bid_rejects_non_positive_or_non_finite_decimal(monkeypatch, amount):
    monkeypatch.setattr(module, "_get_auth", Mock(return_value=auth_record()))
    send_sqs = Mock()
    monkeypatch.setattr(module, "_send_sqs", send_sqs)

    response = module._handle(
        message_event(
            "placeBid",
            {
                "item_id": "item-1",
                "amount": amount,
                "request_id": "request-123",
            },
        )
    )

    assert response["statusCode"] == 400
    send_sqs.assert_not_called()


@pytest.mark.parametrize(
    "request_id",
    [
        None,
        "",
        "1234567",
        12345678,
        "r" * 129,
        "request id",
        "request/123",
        "request\n123",
    ],
)
def test_place_bid_rejects_invalid_request_id(monkeypatch, request_id):
    monkeypatch.setattr(module, "_get_auth", Mock(return_value=auth_record()))
    send_sqs = Mock()
    monkeypatch.setattr(module, "_send_sqs", send_sqs)

    response = module._handle(
        message_event(
            "placeBid",
            {
                "item_id": "item-1",
                "amount": "101",
                "request_id": request_id,
            },
        )
    )

    assert response["statusCode"] == 400
    send_sqs.assert_not_called()


def test_place_bid_accepts_protocol_safe_existing_identifiers(monkeypatch):
    monkeypatch.setattr(
        module,
        "_get_auth",
        Mock(return_value=auth_record(current_item_id="item-1")),
    )
    send_sqs = Mock()
    monkeypatch.setattr(module, "_send_sqs", send_sqs)

    response = module._handle(
        message_event(
            "placeBid",
            {
                "item_id": "item-1",
                "amount": "101",
                "request_id": "r-0001aaaa",
            },
        )
    )

    assert response["statusCode"] == 202
    send_sqs.assert_called_once()


def test_place_bid_accepts_128_character_item_and_request_ids(monkeypatch):
    item_id = "i" * 128
    request_id = "r" * 128
    monkeypatch.setattr(
        module,
        "_get_auth",
        Mock(return_value=auth_record(current_item_id=item_id)),
    )
    send_sqs = Mock()
    monkeypatch.setattr(module, "_send_sqs", send_sqs)

    response = module._handle(
        message_event(
            "placeBid",
            {
                "item_id": item_id,
                "amount": "101",
                "request_id": request_id,
            },
        )
    )

    assert response["statusCode"] == 202
    assert send_sqs.call_args.args[0]["item_id"] == item_id
    assert send_sqs.call_args.args[0]["request_id"] == request_id


def test_send_sqs_uses_item_group_and_request_deduplication(monkeypatch):
    sqs = Mock()
    monkeypatch.setattr(module, "_sqs_client", lambda: sqs)
    command = {
        "item_id": "item-1",
        "amount": Decimal("101.25"),
        "request_id": "request-123",
        "user_sub": "real-user",
        "owner_region": CFG.OWNER_REGION,
        "connection_id": "connection-1",
    }

    module._send_sqs(command)

    kwargs = sqs.send_message.call_args.kwargs
    assert kwargs["QueueUrl"] == CFG.BID_QUEUE_URL
    assert kwargs["MessageGroupId"] == "item-1"
    assert kwargs["MessageDeduplicationId"] == "request-123"
    assert json.loads(kwargs["MessageBody"]) == {
        **command,
        "amount": "101.25",
    }


def test_non_connect_route_without_stored_auth_is_unauthorized(monkeypatch):
    get_auth = Mock(return_value=None)
    send_sqs = Mock()
    monkeypatch.setattr(module, "_get_auth", get_auth)
    monkeypatch.setattr(module, "_send_sqs", send_sqs)

    response = module._handle(
        message_event(
            "placeBid",
            {
                "item_id": "item-1",
                "amount": "101",
                "request_id": "request-123",
            },
            authorizer={"sub": "forged-user", "role": "BIDDER"},
        )
    )

    assert response["statusCode"] == 401
    get_auth.assert_called_once_with("connection-1")
    send_sqs.assert_not_called()


def test_disconnect_transactionally_deletes_owned_room_and_reserved_auth(monkeypatch):
    client = Mock()
    monkeypatch.setattr(module, "_ddb_client", lambda: client)

    module._delete_connection(
        connection_id="connection-1",
        expected_current_item_id="item-1",
        expected_user_sub="user-1",
        expected_session_revision="revision-1",
    )

    actions = client.transact_write_items.call_args.kwargs["TransactItems"]
    assert len(actions) == 2
    assert deserialize(actions[0]["Delete"]["Key"]) == {
        "item_id": "item-1",
        "connection_id": "connection-1",
    }
    assert deserialize(actions[1]["Delete"]["Key"]) == {
        "item_id": AUTH_ITEM_ID,
        "connection_id": "connection-1",
    }
    room_delete = actions[0]["Delete"]
    assert room_delete["TableName"] == CFG.T_CONN
    assert room_delete["ConditionExpression"] == (
        "attribute_not_exists(item_id) OR "
        "(#record_type = :room AND user_sub = :expected_user_sub "
        "AND session_revision = :expected_session_revision)"
    )
    assert room_delete["ExpressionAttributeNames"] == {
        "#record_type": "record_type"
    }
    assert deserialize(room_delete["ExpressionAttributeValues"]) == {
        ":room": "ROOM",
        ":expected_user_sub": "user-1",
        ":expected_session_revision": "revision-1",
    }
    auth_delete = actions[1]["Delete"]
    assert auth_delete["TableName"] == CFG.T_CONN
    assert auth_delete["ConditionExpression"] == (
        "attribute_not_exists(item_id) OR "
        "(record_type = :auth AND user_sub = :expected_user_sub "
        "AND session_revision = :expected_session_revision "
        "AND current_item_id = :expected_item)"
    )
    assert deserialize(auth_delete["ExpressionAttributeValues"]) == {
        ":auth": "AUTH",
        ":expected_user_sub": "user-1",
        ":expected_item": "item-1",
        ":expected_session_revision": "revision-1",
    }


def test_disconnect_without_current_room_requires_current_item_absence(monkeypatch):
    client = Mock()
    monkeypatch.setattr(module, "_ddb_client", lambda: client)

    module._delete_connection(
        connection_id="connection-1",
        expected_current_item_id=None,
        expected_user_sub="user-1",
        expected_session_revision="revision-1",
    )

    actions = client.transact_write_items.call_args.kwargs["TransactItems"]
    assert len(actions) == 1
    auth_delete = actions[0]["Delete"]
    assert auth_delete["ConditionExpression"] == (
        "attribute_not_exists(item_id) OR "
        "(record_type = :auth AND user_sub = :expected_user_sub "
        "AND session_revision = :expected_session_revision "
        "AND attribute_not_exists(current_item_id))"
    )
    assert deserialize(auth_delete["ExpressionAttributeValues"]) == {
        ":auth": "AUTH",
        ":expected_user_sub": "user-1",
        ":expected_session_revision": "revision-1",
    }


def test_disconnect_transaction_cancelled_keeps_newer_auth_and_room_state(
    monkeypatch,
):
    client = Mock()
    client.transact_write_items.side_effect = ClientError(
        {
            "Error": {
                "Code": "TransactionCanceledException",
                "Message": "concurrent join changed auth",
            }
        },
        "TransactWriteItems",
    )
    monkeypatch.setattr(module, "_ddb_client", lambda: client)
    snapshot_auth = auth_record(
        current_item_id="item-old",
        session_revision="revision-old",
        ttl=8_200,
    )
    monkeypatch.setattr(module, "_get_auth", Mock(return_value=snapshot_auth))
    connections = Mock()
    monkeypatch.setattr(module, "table", lambda name: connections)
    warning = Mock()
    monkeypatch.setattr(module.logger, "warning", warning)

    response = module._handle(route_event())

    assert response["statusCode"] == 200
    assert snapshot_auth["session_revision"] == "revision-old"
    assert snapshot_auth["ttl"] == 8_200
    client.transact_write_items.assert_called_once()
    actions = client.transact_write_items.call_args.kwargs["TransactItems"]
    room_delete = actions[0]["Delete"]
    auth_delete = actions[1]["Delete"]
    assert room_delete["ConditionExpression"] == (
        "attribute_not_exists(item_id) OR "
        "(#record_type = :room AND user_sub = :expected_user_sub "
        "AND session_revision = :expected_session_revision)"
    )
    assert deserialize(room_delete["ExpressionAttributeValues"]) == {
        ":room": "ROOM",
        ":expected_user_sub": "real-user",
        ":expected_session_revision": "revision-old",
    }
    assert auth_delete["ConditionExpression"] == (
        "attribute_not_exists(item_id) OR "
        "(record_type = :auth AND user_sub = :expected_user_sub "
        "AND session_revision = :expected_session_revision "
        "AND current_item_id = :expected_item)"
    )
    assert deserialize(auth_delete["ExpressionAttributeValues"]) == {
        ":auth": "AUTH",
        ":expected_user_sub": "real-user",
        ":expected_item": "item-old",
        ":expected_session_revision": "revision-old",
    }
    assert "session_revision = :expected_session_revision" in (
        room_delete["ConditionExpression"]
    )
    assert "session_revision = :expected_session_revision" in (
        auth_delete["ConditionExpression"]
    )
    warning.assert_called_once_with("WebSocket cleanup failed; TTL fallback retained")
    connections.delete_item.assert_not_called()
    assert all("ConditionExpression" in action["Delete"] for action in actions)


def test_disconnect_is_idempotent_when_auth_record_is_missing(monkeypatch):
    get_auth = Mock(return_value=None)
    delete_connection = Mock()
    monkeypatch.setattr(module, "_get_auth", get_auth)
    monkeypatch.setattr(module, "_delete_connection", delete_connection)

    response = module._handle(route_event())

    assert response["statusCode"] == 200
    get_auth.assert_called_once_with("connection-1")
    delete_connection.assert_not_called()


def test_disconnect_cleanup_failure_is_best_effort_and_leaves_ttl_fallback(
    monkeypatch,
):
    stored_auth = auth_record(ttl=8_200)
    monkeypatch.setattr(module, "_get_auth", Mock(return_value=stored_auth))
    monkeypatch.setattr(
        module,
        "_delete_connection",
        Mock(side_effect=RuntimeError("secret cleanup details")),
    )
    warning = Mock()
    monkeypatch.setattr(module.logger, "warning", warning)
    event = route_event(body={"token": "secret-disconnect-token"})

    response = module._handle(event)

    assert response["statusCode"] == 200
    assert stored_auth["ttl"] == 8_200
    warning.assert_called_once_with("WebSocket cleanup failed; TTL fallback retained")
    logged = json.dumps(
        {"args": warning.call_args.args, "kwargs": warning.call_args.kwargs}
    )
    assert "secret" not in logged


def test_unknown_route_directly_authenticates_then_returns_bounded_4xx(monkeypatch):
    get_auth = Mock(return_value=auth_record())
    send_sqs = Mock()
    monkeypatch.setattr(module, "_get_auth", get_auth)
    monkeypatch.setattr(module, "_send_sqs", send_sqs)
    event = message_event(
        "deleteEverything",
        {"token": "secret-token", "user_sub": "forged-user"},
    )

    response = module._handle(event)

    assert response["statusCode"] == 400
    assert len(response["body"]) <= 256
    assert "secret-token" not in response["body"]
    assert "forged-user" not in response["body"]
    get_auth.assert_called_once_with("connection-1")
    send_sqs.assert_not_called()


def test_malformed_json_returns_bounded_4xx_without_sqs(monkeypatch):
    get_auth = Mock(return_value=auth_record())
    send_sqs = Mock()
    monkeypatch.setattr(module, "_get_auth", get_auth)
    monkeypatch.setattr(module, "_send_sqs", send_sqs)
    event = route_event(route="placeBid", body="{not-json secret-token")

    response = module._handle(event)

    assert response["statusCode"] == 400
    assert len(response["body"]) <= 256
    assert "secret-token" not in response["body"]
    get_auth.assert_called_once_with("connection-1")
    send_sqs.assert_not_called()


def test_ack_uses_endpoint_derived_from_request_context(monkeypatch, configured_handler):
    client = Mock()
    client_factory = Mock(return_value=client)
    monkeypatch.setattr(module.boto3, "client", client_factory)
    monkeypatch.setattr(module, "_ack", configured_handler)
    module._management_client.cache_clear()
    event = message_event("joinRoom", {"item_id": "item-1"})
    payload = {"type": "room_joined", "item_id": "item-1"}

    module._ack(event, payload)

    client_factory.assert_called_once_with(
        "apigatewaymanagementapi",
        endpoint_url="https://socket.example.test/prod",
        region_name=CFG.REGION,
    )
    kwargs = client.post_to_connection.call_args.kwargs
    assert kwargs["ConnectionId"] == "connection-1"
    assert json.loads(kwargs["Data"]) == payload
    module._management_client.cache_clear()


def test_ack_prefers_configured_websocket_endpoint(monkeypatch, configured_handler):
    cfg = SimpleNamespace(**{**vars(CFG), "WS_ENDPOINT": "https://override.test/x"})
    monkeypatch.setattr(module, "get_config", lambda: cfg)
    client = Mock()
    client_factory = Mock(return_value=client)
    monkeypatch.setattr(module.boto3, "client", client_factory)
    monkeypatch.setattr(module, "_ack", configured_handler)
    module._management_client.cache_clear()

    module._ack(message_event("joinRoom", {"item_id": "item-1"}), {"ok": True})

    assert client_factory.call_args.kwargs["endpoint_url"] == cfg.WS_ENDPOINT
    module._management_client.cache_clear()


def test_aws_clients_are_lazy_and_cached(monkeypatch):
    clients = {"dynamodb": Mock(), "sqs": Mock()}
    client_factory = Mock(side_effect=lambda service, **kwargs: clients[service])
    monkeypatch.setattr(module.boto3, "client", client_factory)
    module._ddb_client.cache_clear()
    module._sqs_client.cache_clear()

    assert module._ddb_client() is module._ddb_client()
    assert module._sqs_client() is module._sqs_client()

    assert client_factory.call_count == 2
    assert client_factory.call_args_list[0].args == ("dynamodb",)
    assert client_factory.call_args_list[1].args == ("sqs",)
    module._ddb_client.cache_clear()
    module._sqs_client.cache_clear()


def test_management_client_cache_is_bounded_to_four_endpoints(monkeypatch):
    client_factory = Mock(side_effect=lambda service, **kwargs: Mock())
    monkeypatch.setattr(module.boto3, "client", client_factory)
    module._management_client.cache_clear()

    endpoints = [f"https://socket-{index}.example.test/prod" for index in range(5)]
    for endpoint in endpoints:
        module._management_client(endpoint)

    cache_info = module._management_client.cache_info()
    assert cache_info.maxsize == 4
    assert cache_info.currsize == 4
    module._management_client(endpoints[0])
    assert client_factory.call_count == 6
    module._management_client.cache_clear()


def test_handler_delegates_to_testable_handle(monkeypatch):
    event = route_event()
    expected = {"statusCode": 204, "body": ""}
    handle = Mock(return_value=expected)
    monkeypatch.setattr(module, "_handle", handle)
    context = SimpleNamespace(
        function_name="ws-handler",
        memory_limit_in_mb=128,
        invoked_function_arn="arn:aws:lambda:region:account:function:ws-handler",
        aws_request_id="request-id",
    )

    assert module.handler(event, context) == expected
    handle.assert_called_once_with(event)


def test_handler_disables_event_logging_even_when_environment_enables_it():
    token = "secret-event-token"
    script = "\n".join(
        [
            "from types import SimpleNamespace",
            "import functions.ws_handler.handler as module",
            "module._handle = lambda event: {'statusCode': 200, 'body': ''}",
            "module.handler(",
            f"    {{'requestContext': {{'connectionId': 'c1', "
            f"'routeKey': '$connect'}}, 'body': '{token}'}},",
            "    SimpleNamespace(",
            "        function_name='ws-handler',",
            "        memory_limit_in_mb=128,",
            "        invoked_function_arn='arn:aws:lambda:region:function',",
            "        aws_request_id='request-id',",
            "    ),",
            ")",
        ]
    )
    env = os.environ.copy()
    env["POWERTOOLS_LOGGER_LOG_EVENT"] = "true"
    env["POWERTOOLS_LOG_LEVEL"] = "INFO"

    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=Path(__file__).parents[2],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    captured = result.stdout + result.stderr
    assert result.returncode == 0, captured
    assert token not in captured
