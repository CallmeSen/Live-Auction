import json
import os
import subprocess
import sys
from types import SimpleNamespace
from unittest.mock import Mock, call

import pytest
from botocore.exceptions import (
    BotoCoreError,
    ClientError,
    EndpointConnectionError,
    ReadTimeoutError,
)

import functions.broadcast.handler as module


CFG = SimpleNamespace(
    REGION="ap-southeast-1",
    T_CONN="connections-table",
    T_STATE="state-table",
    T_EVENTS="events-table",
    WS_ENDPOINT="https://socket.example.test/prod",
)


def broadcast_event(result, item_id="item-1"):
    return {"item_id": item_id, "result": result}


def aws_error(code, *, status_code=None):
    response = {
        "Error": {
            "Code": code,
            "Message": "secret-token should not be logged",
        }
    }
    if status_code is not None:
        response["ResponseMetadata"] = {"HTTPStatusCode": status_code}
    return ClientError(response, "PostToConnection")


def patch_dependencies(monkeypatch, room_table, api):
    monkeypatch.setattr(module, "get_config", lambda: CFG)
    monkeypatch.setattr(module, "_room_table", lambda: room_table)
    monkeypatch.setattr(module, "_api", lambda: api)


@pytest.mark.parametrize(
    "event",
    [
        {},
        {"item_id": "", "result": {"status": "ACCEPTED"}},
        {"item_id": "i" * 129, "result": {"status": "ACCEPTED"}},
        {"item_id": 123, "result": {"status": "ACCEPTED"}},
        {"item_id": "item-1"},
        {"item_id": "item-1", "result": None},
        {"item_id": "item-1", "result": {}},
        {"item_id": "item-1", "result": {"status": None}},
        {"item_id": "item-1", "result": {"status": 123}},
        {"item_id": "item-1", "result": {"status": []}},
        {"item_id": "item-1", "result": {"status": {}}},
        {
            "item_id": "item-1",
            "result": {"status": "secret-event-token" * 20},
        },
    ],
)
def test_invalid_event_is_bounded_and_rejected_before_aws_clients(
    monkeypatch, event
):
    api_factory = Mock()
    room_table_factory = Mock()
    monkeypatch.setattr(module, "_api", api_factory)
    monkeypatch.setattr(module, "_room_table", room_table_factory)

    with pytest.raises(ValueError) as caught:
        module._handle(event)

    assert str(caught.value) == "invalid broadcast event"
    assert len(str(caught.value)) <= 64
    assert "secret-event-token" not in str(caught.value)
    api_factory.assert_not_called()
    room_table_factory.assert_not_called()


def test_accepted_result_posts_to_every_room_connection_and_redacts_payload(
    monkeypatch,
):
    room_table = Mock()
    room_table.query.return_value = {
        "Items": [
            {"item_id": "item-1", "connection_id": "a", "record_type": "ROOM"},
            {"item_id": "item-1", "connection_id": "auth", "record_type": "AUTH"},
            {"item_id": "item-1", "connection_id": "b", "record_type": "ROOM"},
        ]
    }
    api = Mock()
    patch_dependencies(monkeypatch, room_table, api)

    result = module._handle(
        broadcast_event(
            {
                "status": "ACCEPTED",
                "request_id": "request-1",
                "current_price": "101",
                "extension_count": 1,
                "connection_id": "origin",
                "jwt": "secret-jwt",
                "email": "bidder@example.test",
                "secret": "secret-value",
            }
        )
    )

    assert result == {"delivered": 2, "stale": 0, "failed": 0}
    assert api.post_to_connection.call_count == 2
    assert {
        item.kwargs["ConnectionId"]
        for item in api.post_to_connection.call_args_list
    } == {"a", "b"}
    for posted in api.post_to_connection.call_args_list:
        assert isinstance(posted.kwargs["Data"], bytes)
        payload = json.loads(posted.kwargs["Data"])
        assert payload == {
            "type": "price_update",
            "item_id": "item-1",
            "status": "ACCEPTED",
            "request_id": "request-1",
            "current_price": "101",
            "extension_count": 1,
        }
        assert "secret" not in payload
        assert "jwt" not in payload
        assert "email" not in payload
        assert "connection_id" not in payload
    room_table.query.assert_called_once_with(
        KeyConditionExpression="item_id = :i",
        ExpressionAttributeValues={":i": "item-1"},
    )


def test_accepted_result_queries_until_pagination_is_exhausted(monkeypatch):
    room_table = Mock()
    room_table.query.side_effect = [
        {
            "Items": [
                {"item_id": "item-1", "connection_id": "a", "record_type": "ROOM"}
            ],
            "LastEvaluatedKey": {"item_id": "item-1", "connection_id": "a"},
        },
        {
            "Items": [
                {"item_id": "item-1", "connection_id": "b", "record_type": "ROOM"}
            ]
        },
    ]
    api = Mock()
    patch_dependencies(monkeypatch, room_table, api)

    result = module._handle(
        broadcast_event({"status": "ACCEPTED", "current_price": "101"})
    )

    assert result == {"delivered": 2, "stale": 0, "failed": 0}
    assert room_table.query.call_args_list == [
        call(
            KeyConditionExpression="item_id = :i",
            ExpressionAttributeValues={":i": "item-1"},
        ),
        call(
            KeyConditionExpression="item_id = :i",
            ExpressionAttributeValues={":i": "item-1"},
            ExclusiveStartKey={"item_id": "item-1", "connection_id": "a"},
        ),
    ]
    assert {
        item.kwargs["ConnectionId"]
        for item in api.post_to_connection.call_args_list
    } == {"a", "b"}


def test_rejected_result_targets_only_originating_connection_without_query(
    monkeypatch,
):
    room_table = Mock()
    room_table_factory = Mock(return_value=room_table)
    api = Mock()
    patch_dependencies(monkeypatch, room_table, api)
    monkeypatch.setattr(module, "_room_table", room_table_factory)

    result = module._handle(
        broadcast_event(
            {
                "status": "REJECTED",
                "reason": "REJECTED_LOW_INCREMENT",
                "request_id": "request-1",
                "connection_id": "bidder-b",
            }
        )
    )

    assert result == {"delivered": 1, "stale": 0, "failed": 0}
    room_table_factory.assert_not_called()
    room_table.query.assert_not_called()
    api.post_to_connection.assert_called_once()
    assert api.post_to_connection.call_args.kwargs["ConnectionId"] == "bidder-b"
    assert json.loads(api.post_to_connection.call_args.kwargs["Data"]) == {
        "type": "bid_result",
        "item_id": "item-1",
        "status": "REJECTED",
        "reason": "REJECTED_LOW_INCREMENT",
        "request_id": "request-1",
    }


def test_rejected_result_without_connection_id_does_not_create_aws_client(
    monkeypatch,
):
    room_table = Mock()
    api_factory = Mock()
    monkeypatch.setattr(module, "get_config", lambda: CFG)
    monkeypatch.setattr(module, "_room_table", lambda: room_table)
    monkeypatch.setattr(module, "_api", api_factory)

    result = module._handle(
        broadcast_event({"status": "REJECTED", "reason": "REJECTED_NOT_LIVE"})
    )

    assert result == {"delivered": 0, "stale": 0, "failed": 0}
    api_factory.assert_not_called()
    room_table.query.assert_not_called()
    room_table.delete_item.assert_not_called()


def test_410_accepted_delivery_deletes_stale_room_and_continues(monkeypatch):
    room_table = Mock()
    room_table.query.return_value = {
        "Items": [
            {
                "item_id": "item-1",
                "connection_id": "stale",
                "record_type": "ROOM",
                "session_revision": "revision-stale",
            },
            {"item_id": "item-1", "connection_id": "live", "record_type": "ROOM"},
        ]
    }
    api = Mock()
    api.post_to_connection.side_effect = [
        aws_error("GoneException"),
        None,
    ]
    patch_dependencies(monkeypatch, room_table, api)

    result = module._handle(
        broadcast_event({"status": "ACCEPTED", "current_price": "101"})
    )

    assert result == {"delivered": 1, "stale": 1, "failed": 0}
    room_table.delete_item.assert_called_once_with(
        Key={"item_id": "item-1", "connection_id": "stale"},
        ConditionExpression=(
            "#record_type = :room AND session_revision = :session_revision"
        ),
        ExpressionAttributeNames={"#record_type": "record_type"},
        ExpressionAttributeValues={
            ":room": "ROOM",
            ":session_revision": "revision-stale",
        },
    )
    assert api.post_to_connection.call_count == 2


@pytest.mark.parametrize(
    "room",
    [
        {"item_id": "item-1", "connection_id": "stale", "record_type": "ROOM"},
        {
            "item_id": "item-1",
            "connection_id": "stale",
            "record_type": "ROOM",
            "session_revision": "",
        },
        {
            "item_id": "item-1",
            "connection_id": "stale",
            "record_type": "ROOM",
            "session_revision": "   ",
        },
        {
            "item_id": "item-1",
            "connection_id": "stale",
            "record_type": "ROOM",
            "session_revision": 123,
        },
    ],
)
def test_accepted_stale_without_valid_revision_skips_unsafe_cleanup(
    monkeypatch, room
):
    room_table = Mock()
    room_table.query.return_value = {"Items": [room]}
    api = Mock()
    api.post_to_connection.side_effect = aws_error("GoneException")
    patch_dependencies(monkeypatch, room_table, api)

    result = module._handle(
        broadcast_event({"status": "ACCEPTED", "current_price": "101"})
    )

    assert result == {"delivered": 0, "stale": 1, "failed": 0}
    room_table.delete_item.assert_not_called()


def test_http_410_is_stale_for_rejected_target_and_deletes_room(monkeypatch):
    room_table = Mock()
    api = Mock()
    api.post_to_connection.side_effect = aws_error(
        "Gone", status_code=410
    )
    patch_dependencies(monkeypatch, room_table, api)

    result = module._handle(
        broadcast_event(
            {
                "status": "REJECTED",
                "connection_id": "stale",
                "reason": "REJECTED_NOT_LIVE",
            }
        )
    )

    assert result == {"delivered": 0, "stale": 1, "failed": 0}
    room_table.query.assert_not_called()
    room_table.delete_item.assert_called_once_with(
        Key={"item_id": "item-1", "connection_id": "stale"},
        ConditionExpression="#record_type = :room",
        ExpressionAttributeNames={"#record_type": "record_type"},
        ExpressionAttributeValues={":room": "ROOM"},
    )


def test_conditional_cleanup_race_is_already_changed_and_silent(monkeypatch):
    room_table = Mock()
    room_table.query.return_value = {
        "Items": [
            {
                "item_id": "item-1",
                "connection_id": "stale",
                "record_type": "ROOM",
                "session_revision": "revision-old",
            },
            {
                "item_id": "item-1",
                "connection_id": "live",
                "record_type": "ROOM",
                "session_revision": "revision-live",
            },
        ]
    }
    room_table.delete_item.side_effect = aws_error(
        "ConditionalCheckFailedException"
    )
    api = Mock()
    api.post_to_connection.side_effect = [aws_error("GoneException"), None]
    warning = Mock()
    patch_dependencies(monkeypatch, room_table, api)
    monkeypatch.setattr(module.logger, "warning", warning)

    result = module._handle(
        broadcast_event({"status": "ACCEPTED", "current_price": "101"})
    )

    assert result == {"delivered": 1, "stale": 1, "failed": 0}
    warning.assert_not_called()
    assert api.post_to_connection.call_count == 2
    assert room_table.delete_item.call_args.kwargs[
        "ExpressionAttributeValues"
    ][":session_revision"] == "revision-old"


def test_nonconditional_cleanup_error_warns_and_keeps_stale_count(monkeypatch):
    room_table = Mock()
    room_table.query.return_value = {
        "Items": [
            {
                "item_id": "item-1",
                "connection_id": "stale",
                "record_type": "ROOM",
                "session_revision": "revision-stale",
            }
        ]
    }
    room_table.delete_item.side_effect = aws_error(
        "ProvisionedThroughputExceededException"
    )
    api = Mock()
    api.post_to_connection.side_effect = aws_error("GoneException")
    warning = Mock()
    patch_dependencies(monkeypatch, room_table, api)
    monkeypatch.setattr(module.logger, "warning", warning)

    result = module._handle(
        broadcast_event({"status": "ACCEPTED", "current_price": "101"})
    )

    assert result == {"delivered": 0, "stale": 1, "failed": 0}
    warning.assert_called_once_with(
        "Stale room cleanup failed",
        extra={"error_code": "ProvisionedThroughputExceededException"},
    )


def test_other_client_error_logs_bounded_warning_and_continues(monkeypatch):
    long_code = "E" * 64 + "secret-code-tail"
    room_table = Mock()
    room_table.query.return_value = {
        "Items": [
            {"item_id": "item-1", "connection_id": "failed", "record_type": "ROOM"},
            {"item_id": "item-1", "connection_id": "live", "record_type": "ROOM"},
        ]
    }
    api = Mock()
    api.post_to_connection.side_effect = [
        aws_error(long_code),
        None,
    ]
    warning = Mock()
    patch_dependencies(monkeypatch, room_table, api)
    monkeypatch.setattr(module.logger, "warning", warning)

    result = module._handle(
        broadcast_event({"status": "ACCEPTED", "current_price": "101"})
    )

    assert result == {"delivered": 1, "stale": 0, "failed": 1}
    room_table.delete_item.assert_not_called()
    warning.assert_called_once_with(
        "WebSocket delivery failed",
        extra={"error_code": "E" * 64},
    )
    assert len(warning.call_args.kwargs["extra"]["error_code"]) == 64
    assert "secret-code-tail" not in repr(warning.call_args)
    assert "secret-token" not in repr(warning.call_args)


def test_transport_errors_log_generic_warning_and_continue_fanout(monkeypatch):
    room_table = Mock()
    room_table.query.return_value = {
        "Items": [
            {
                "item_id": "item-1",
                "connection_id": connection_id,
                "record_type": "ROOM",
            }
            for connection_id in ("base", "endpoint", "timeout", "live")
        ]
    }
    api = Mock()
    api.post_to_connection.side_effect = [
        BotoCoreError(),
        EndpointConnectionError(endpoint_url="https://secret-endpoint.test"),
        ReadTimeoutError(
            endpoint_url="https://secret-endpoint.test",
            error=TimeoutError("secret-timeout"),
        ),
        None,
    ]
    warning = Mock()
    patch_dependencies(monkeypatch, room_table, api)
    monkeypatch.setattr(module.logger, "warning", warning)

    result = module._handle(
        broadcast_event({"status": "ACCEPTED", "current_price": "101"})
    )

    assert result == {"delivered": 1, "stale": 0, "failed": 3}
    assert api.post_to_connection.call_count == 4
    assert warning.call_args_list == [
        call("WebSocket delivery failed"),
        call("WebSocket delivery failed"),
        call("WebSocket delivery failed"),
    ]
    assert "secret-endpoint" not in repr(warning.call_args_list)
    assert "secret-timeout" not in repr(warning.call_args_list)


def test_programming_error_from_post_is_not_swallowed(monkeypatch):
    room_table = Mock()
    room_table.query.return_value = {
        "Items": [
            {"item_id": "item-1", "connection_id": "a", "record_type": "ROOM"}
        ]
    }
    api = Mock()
    api.post_to_connection.side_effect = RuntimeError("programming failure")
    warning = Mock()
    patch_dependencies(monkeypatch, room_table, api)
    monkeypatch.setattr(module.logger, "warning", warning)

    with pytest.raises(RuntimeError, match="programming failure"):
        module._handle(
            broadcast_event({"status": "ACCEPTED", "current_price": "101"})
        )

    warning.assert_not_called()


def test_handler_delegates_to_testable_handle(monkeypatch):
    event = broadcast_event({"status": "ACCEPTED", "current_price": "101"})
    expected = {"delivered": 0, "stale": 0, "failed": 0}
    handle = Mock(return_value=expected)
    monkeypatch.setattr(module, "_handle", handle)

    context = SimpleNamespace(
        function_name="broadcast",
        memory_limit_in_mb=128,
        invoked_function_arn="arn:aws:lambda:region:account:function:broadcast",
        aws_request_id="request-id",
    )
    assert module.handler(event, context) == expected
    handle.assert_called_once_with(event)


def test_management_client_is_lazy_and_bounded_cached(monkeypatch):
    client = Mock()
    client_factory = Mock(return_value=client)
    monkeypatch.setattr(module, "get_config", lambda: CFG)
    monkeypatch.setattr(module.boto3, "client", client_factory)
    module._api.cache_clear()

    assert client_factory.call_count == 0
    assert module._api() is module._api()
    assert client_factory.call_count == 1
    client_factory.assert_called_once_with(
        "apigatewaymanagementapi",
        endpoint_url=CFG.WS_ENDPOINT,
        region_name=CFG.REGION,
    )
    assert module._api.cache_info().maxsize == 1
    assert module._api.cache_info().currsize == 1
    module._api.cache_clear()


def test_handler_emits_bounded_warning_without_event_or_error_secrets():
    event_token = "secret-event-token"
    error_token = "secret-error-token"
    long_code = "E" * 64 + "secret-code-tail"
    script = "\n".join(
        [
            "from types import SimpleNamespace",
            "from botocore.exceptions import ClientError",
            "import functions.broadcast.handler as module",
            "class Api:",
            "    def post_to_connection(self, **kwargs):",
            "        raise ClientError(",
            f"            {{'Error': {{'Code': {long_code!r}, "
            f"'Message': {error_token!r}}}}},",
            "            'PostToConnection',",
            "        )",
            "module._api = lambda: Api()",
            "module.handler(",
            "    {'item_id': 'item-1', 'result': {",
            "        'status': 'REJECTED',",
            "        'connection_id': 'connection-1',",
            f"        'secret': {event_token!r},",
            "    }},",
            "    SimpleNamespace(",
            "        function_name='broadcast',",
            "        memory_limit_in_mb=128,",
            "        invoked_function_arn='arn:aws:lambda:region:function',",
            "        aws_request_id='request-id',",
            "    ),",
            ")",
        ]
    )
    env = os.environ.copy()
    for name in ("LOG_LEVEL", "POWERTOOLS_LOG_LEVEL", "AWS_LAMBDA_LOG_LEVEL"):
        env.pop(name, None)
    env["POWERTOOLS_LOGGER_LOG_EVENT"] = "true"
    env["POWERTOOLS_LOG_LEVEL"] = "INFO"

    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    captured = result.stdout + result.stderr
    assert result.returncode == 0, captured
    assert "WebSocket delivery failed" in captured
    assert "E" * 64 in captured
    assert "E" * 65 not in captured
    assert "secret-code-tail" not in captured
    assert event_token not in captured
    assert error_token not in captured
