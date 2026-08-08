import json
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock

from botocore.exceptions import ClientError

import functions.bid_processor.handler as handler_module
from auction_common.errors import ACCEPTED, RejectReason
from auction_common.models import BidCommand, BidResult


CFG = SimpleNamespace(
    T_STATE="state-table",
    T_EVENTS="events-table",
    BROADCAST_FN="",
)


def command(**overrides) -> BidCommand:
    values = {
        "item_id": "item-1",
        "amount": Decimal("101"),
        "request_id": "request-1",
        "user_sub": "bidder-1",
        "owner_region": "ap-southeast-1",
        "connection_id": "connection-1",
    }
    values.update(overrides)
    return BidCommand(**values)


def state(**overrides) -> dict:
    values = {
        "item_id": "item-1",
        "current_price": Decimal("100"),
        "status": "LIVE",
        "owner_region": "ap-southeast-1",
        "end_time": 9999999999,
        "version": 3,
        "seller_sub": "seller-1",
        "extension_count": 0,
    }
    values.update(overrides)
    return values


def patch_tables(monkeypatch, state_table, events_table):
    monkeypatch.setattr(handler_module, "get_config", lambda: CFG)
    monkeypatch.setattr(
        handler_module,
        "table",
        lambda name: state_table if name == CFG.T_STATE else events_table,
    )


def test_duplicate_detection_queries_events_by_item_and_request(monkeypatch):
    events_table = Mock()
    events_table.query.return_value = {"Count": 1}
    patch_tables(monkeypatch, Mock(), events_table)

    assert handler_module._is_duplicate("item-1", "request-1") is True
    events_table.query.assert_called_once_with(
        KeyConditionExpression="item_id = :i",
        FilterExpression="request_id = :r",
        ExpressionAttributeValues={":i": "item-1", ":r": "request-1"},
        Limit=1,
    )


def test_commit_uses_live_price_and_version_conditions(monkeypatch):
    state_table = Mock()
    patch_tables(monkeypatch, state_table, Mock())
    bid = command()
    result = BidResult(
        item_id=bid.item_id,
        request_id=bid.request_id,
        status=ACCEPTED,
        current_price=bid.amount,
    )

    extension_count = handler_module._commit(bid, state(), result, now=1000)

    kwargs = state_table.update_item.call_args.kwargs
    assert kwargs["ConditionExpression"] == (
        "#status = :live AND current_price < :amount AND version = :version"
    )
    assert kwargs["ExpressionAttributeValues"][":version"] == 3
    assert kwargs["ExpressionAttributeValues"][":amount"] == Decimal("101")
    assert result.end_time == 9999999999
    assert extension_count == 0


def test_commit_returns_the_updated_anti_snipe_extension_count(monkeypatch):
    state_table = Mock()
    patch_tables(monkeypatch, state_table, Mock())
    bid = command()
    result = BidResult(
        item_id=bid.item_id,
        request_id=bid.request_id,
        status=ACCEPTED,
        current_price=bid.amount,
    )

    extension_count = handler_module._commit(
        bid,
        state(end_time=1010),
        result,
        now=1000,
    )

    assert extension_count == 1
    assert result.end_time == 1060


def test_commit_maps_concurrent_update_to_low_increment(monkeypatch):
    state_table = Mock()
    state_table.update_item.side_effect = ClientError(
        {
            "Error": {
                "Code": "ConditionalCheckFailedException",
                "Message": "version changed",
            }
        },
        "UpdateItem",
    )
    patch_tables(monkeypatch, state_table, Mock())
    bid = command()
    result = BidResult(
        item_id=bid.item_id,
        request_id=bid.request_id,
        status=ACCEPTED,
        current_price=bid.amount,
    )

    handler_module._commit(bid, state(), result, now=1000)

    assert result.status == "REJECTED"
    assert result.reason == RejectReason.LOW_INCREMENT


def test_write_audit_preserves_decimal_amount(monkeypatch):
    events_table = Mock()
    patch_tables(monkeypatch, Mock(), events_table)
    bid = command()
    result = BidResult(
        item_id=bid.item_id,
        request_id=bid.request_id,
        status="REJECTED",
        reason=RejectReason.LOW_INCREMENT,
    )

    handler_module._write_audit(bid, result, now_ms=1700000000123)

    item = events_table.put_item.call_args.kwargs["Item"]
    assert item == {
        "item_id": "item-1",
        "sk": "1700000000123#request-1",
        "request_id": "request-1",
        "amount": Decimal("101"),
        "status": "REJECTED",
        "reason": RejectReason.LOW_INCREMENT,
        "bidder_sub": "bidder-1",
    }


def test_broadcast_is_noop_without_function_name(monkeypatch):
    monkeypatch.setattr(handler_module, "get_config", lambda: CFG)
    lambda_client = Mock()
    monkeypatch.setattr(handler_module, "_lambda_client", lambda: lambda_client)

    handler_module._notify_broadcast(
        BidResult(item_id="item-1", request_id="request-1", status=ACCEPTED)
    )

    lambda_client.invoke.assert_not_called()


def test_broadcast_invokes_async_when_configured(monkeypatch):
    lambda_client = Mock()
    monkeypatch.setattr(
        handler_module,
        "get_config",
        lambda: SimpleNamespace(BROADCAST_FN="broadcast-function"),
    )
    monkeypatch.setattr(handler_module, "_lambda_client", lambda: lambda_client)
    result = BidResult(
        item_id="item-1",
        request_id="request-1",
        status=ACCEPTED,
        current_price=Decimal("101"),
    )

    handler_module._notify_broadcast(result, extension_count=1)

    kwargs = lambda_client.invoke.call_args.kwargs
    assert kwargs["FunctionName"] == "broadcast-function"
    assert kwargs["InvocationType"] == "Event"
    payload = json.loads(kwargs["Payload"])
    assert payload["result"]["current_price"] == "101"
    assert payload["result"]["extension_count"] == 1


def test_process_one_accepted_path_reads_commits_and_audits(monkeypatch):
    state_table = Mock()
    state_table.get_item.return_value = {"Item": state()}
    events_table = Mock()
    events_table.query.return_value = {"Count": 0}
    patch_tables(monkeypatch, state_table, events_table)
    monkeypatch.setattr(handler_module, "_notify_broadcast", Mock())
    record = SimpleNamespace(body=command().model_dump_json())

    handler_module._process_one(record)

    events_table.query.assert_called_once()
    state_table.get_item.assert_called_once_with(
        Key={"item_id": "item-1"}, ConsistentRead=True
    )
    state_table.update_item.assert_called_once()
    events_table.put_item.assert_called_once()


def test_process_one_duplicate_stops_before_state_update(monkeypatch):
    state_table = Mock()
    events_table = Mock()
    events_table.query.return_value = {"Count": 1}
    patch_tables(monkeypatch, state_table, events_table)
    monkeypatch.setattr(handler_module, "_notify_broadcast", Mock())
    record = SimpleNamespace(body=command().model_dump_json())

    handler_module._process_one(record)

    state_table.get_item.assert_not_called()
    state_table.update_item.assert_not_called()
    events_table.put_item.assert_not_called()


def test_process_one_missing_item_stops_without_write(monkeypatch):
    state_table = Mock()
    state_table.get_item.return_value = {}
    events_table = Mock()
    events_table.query.return_value = {"Count": 0}
    patch_tables(monkeypatch, state_table, events_table)
    monkeypatch.setattr(handler_module, "_notify_broadcast", Mock())
    record = SimpleNamespace(body=command().model_dump_json())

    handler_module._process_one(record)

    state_table.update_item.assert_not_called()
    events_table.put_item.assert_not_called()


def test_handler_delegates_to_partial_batch_response(monkeypatch):
    expected = {"batchItemFailures": []}
    delegated = {}

    def fake_process_partial_response(event, record_handler, processor, context):
        delegated.update(
            event=event,
            record_handler=record_handler,
            processor=processor,
            context=context,
        )
        return expected

    monkeypatch.setattr(
        handler_module, "process_partial_response", fake_process_partial_response
    )

    event = {"Records": []}
    context = SimpleNamespace(
        function_name="bid-processor",
        memory_limit_in_mb=256,
        invoked_function_arn="arn:aws:lambda:ap-southeast-1:233376973052:function:bid-processor",
        aws_request_id="request-context-1",
    )
    assert handler_module.handler(event, context) == expected
    assert delegated["event"] == event
    assert delegated["record_handler"] is handler_module._process_one
    assert delegated["processor"] is handler_module.processor
    assert delegated["context"] is context


def test_handler_reports_only_failed_sqs_record(monkeypatch):
    def process_record(record):
        handler_module.metrics.add_metric(
            name="SyntheticBatchRecord", unit=handler_module.MetricUnit.Count, value=1
        )
        if record.message_id == "failed-message":
            raise RuntimeError("synthetic failure")

    monkeypatch.setattr(handler_module, "_process_one", process_record)

    def sqs_record(message_id):
        return {
            "messageId": message_id,
            "receiptHandle": f"receipt-{message_id}",
            "body": "{}",
            "attributes": {
                "ApproximateReceiveCount": "1",
                "SentTimestamp": "1700000000000",
                "SenderId": "sender-1",
                "ApproximateFirstReceiveTimestamp": "1700000000000",
                "MessageGroupId": "item-1",
                "MessageDeduplicationId": message_id,
                "SequenceNumber": "1",
            },
            "messageAttributes": {},
            "md5OfBody": "99914b932bd37a50b983c5e7c90ae93b",
            "eventSource": "aws:sqs",
            "eventSourceARN": (
                "arn:aws:sqs:ap-southeast-1:233376973052:la-bid-commands.fifo"
            ),
            "awsRegion": "ap-southeast-1",
        }

    event = {
        "Records": [sqs_record("success-message"), sqs_record("failed-message")]
    }
    context = SimpleNamespace(
        function_name="bid-processor",
        memory_limit_in_mb=256,
        invoked_function_arn="arn:aws:lambda:ap-southeast-1:233376973052:function:bid-processor",
        aws_request_id="request-context-2",
    )

    assert handler_module.handler(event, context) == {
        "batchItemFailures": [{"itemIdentifier": "failed-message"}]
    }
