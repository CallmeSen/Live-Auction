import ast
import copy
import json
import os
import shutil
import subprocess
import sys
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

import pytest
from boto3.dynamodb.types import TypeDeserializer, TypeSerializer
from botocore.exceptions import ClientError

from auction_common.catalog import item_key, item_lookup_key, rules_key, session_key
from auction_common.http import (
    BadRequest,
    Conflict,
    Forbidden,
    NotFound,
    RequestIdentity,
)
from functions.admin_command import handler as service


DESERIALIZER = TypeDeserializer()
SERIALIZER = TypeSerializer()
ROOT = Path(__file__).parents[2]


def seller(sub="seller-sub"):
    return RequestIdentity(sub=sub, groups=frozenset({"SELLER"}))


def admin(sub="admin-sub"):
    return RequestIdentity(sub=sub, groups=frozenset({"ADMIN"}))


@pytest.fixture
def fake_config():
    return SimpleNamespace(
        ADMIN_COMMAND_ARN=(
            "arn:aws:lambda:ap-southeast-1:233376973052:"
            "function:la-admin-command"
        ),
        SCHEDULER_ROLE_ARN=(
            "arn:aws:iam::233376973052:role/la-scheduler-invoke"
        ),
        SCHEDULER_DLQ_ARN=(
            "arn:aws:sqs:ap-southeast-1:233376973052:la-scheduler-dlq"
        ),
        SCHEDULER_GROUP="la-lifecycle",
        OWNER_REGION="ap-southeast-1",
        T_CATALOG="catalog",
        T_STATE="state",
        T_EVENTS="events",
    )


def client_error(code, operation, reasons=None, message="failure"):
    response = {"Error": {"Code": code, "Message": message}}
    if reasons is not None:
        response["CancellationReasons"] = reasons
    return ClientError(response, operation)


class FakeScheduler:
    def __init__(
        self,
        create_error=None,
        existing=None,
        delete_error=None,
        get_error=None,
    ):
        self.create_error = create_error
        self.existing = existing
        self.delete_error = delete_error
        self.get_error = get_error
        self.create_calls = []
        self.get_calls = []
        self.delete_calls = []

    def create_schedule(self, **kwargs):
        self.create_calls.append(kwargs)
        if self.create_error is not None:
            raise self.create_error
        return {}

    def get_schedule(self, **kwargs):
        self.get_calls.append(kwargs)
        if self.get_error is not None:
            raise self.get_error
        return self.existing or {}

    def delete_schedule(self, **kwargs):
        self.delete_calls.append(kwargs)
        if self.delete_error is not None:
            raise self.delete_error
        return {}


class FakeClient:
    def __init__(self, transaction_error=None):
        self.transaction_error = transaction_error
        self.transact_calls = []

    def transact_write_items(self, **kwargs):
        self.transact_calls.append(kwargs)
        if self.transaction_error is not None:
            raise self.transaction_error
        return {}


class FakeTable:
    def __init__(
        self,
        name,
        records=None,
        query_responses=None,
        client=None,
        update_errors=None,
    ):
        self.name = name
        self.records = records or {}
        self.query_responses = list(query_responses or [])
        self.meta = SimpleNamespace(client=client or FakeClient())
        self._transaction_client = self.meta.client
        self.get_calls = []
        self.query_calls = []
        self.update_calls = []
        self.update_errors = list(update_errors or [])

    @staticmethod
    def _key(key):
        return tuple(sorted(key.items()))

    def get_item(self, **kwargs):
        self.get_calls.append(kwargs)
        item = self.records.get(self._key(kwargs["Key"]))
        return {} if item is None else {"Item": item}

    def query(self, **kwargs):
        self.query_calls.append(kwargs)
        if self.query_responses:
            return self.query_responses.pop(0)
        return {"Items": []}

    def update_item(self, **kwargs):
        self.update_calls.append(kwargs)
        if self.update_errors:
            error = self.update_errors.pop(0)
            if error is not None:
                raise error
        return {}


class FakeMetrics:
    def __init__(self):
        self.calls = []

    def add_metric(self, **kwargs):
        self.calls.append(kwargs)


def key_map(*items):
    return {FakeTable._key(key): value for key, value in items}


def session(status="DRAFT", version=4, **overrides):
    return {
        **session_key("s1"),
        "entity_type": "SESSION",
        "session_id": "s1",
        "seller_sub": "seller-sub",
        "status": status,
        "version": version,
        "start_time": 1_700_000_100,
        "gsi2pk": "SESSION",
        "gsi2sk": f"STATUS#{status}#START#1700000100#s1",
        **overrides,
    }


def rules():
    return {
        **rules_key("s1"),
        "entity_type": "SESSION_RULES",
        "session_id": "s1",
        "min_increment": Decimal("1"),
        "max_increment": Decimal("1000"),
        "anti_snipe_window_s": 30,
        "anti_snipe_extend_s": 60,
        "max_extensions": 10,
        "public_history_limit": 20,
    }


def catalog_item(
    item_id="i1",
    sequence=1,
    status="WAITING",
    version=2,
    **overrides,
):
    return {
        **item_key("s1", sequence, item_id),
        "entity_type": "ITEM",
        "item_id": item_id,
        "session_id": "s1",
        "sequence_number": sequence,
        "seller_sub": "seller-sub",
        "status": status,
        "version": version,
        "start_price": Decimal("100"),
        "duration_s": 60,
        "created_at": 1_699_999_000 + sequence,
        "gsi2pk": "ITEM",
        "gsi2sk": (
            f"STATUS#{status}#CREATED#{1_699_999_000 + sequence:010d}#{item_id}"
        ),
        **overrides,
    }


def lookup(item):
    return {
        **item_lookup_key(item["item_id"]),
        "entity_type": "ITEM_LOOKUP",
        "item_id": item["item_id"],
        "session_id": item["session_id"],
        "sequence_number": item["sequence_number"],
    }


def active_state(status="LIVE", item_id="i1", version=3, **overrides):
    return {
        "item_id": item_id,
        "session_id": "s1",
        "seller_sub": "seller-sub",
        "status": status,
        "current_price": Decimal("100"),
        "end_time": 1_700_000_060,
        "owner_region": "ap-southeast-1",
        "extension_count": 0,
        "version": version,
        **overrides,
    }


def decode_item(value):
    return {key: DESERIALIZER.deserialize(item) for key, item in value.items()}


def dynamo_round_trip(value):
    return decode_item({key: SERIALIZER.serialize(item) for key, item in value.items()})


def exact_existing_schedule(payload, fake_config, expression):
    return {
        "ScheduleExpression": expression,
        "ScheduleExpressionTimezone": "UTC",
        "State": "ENABLED",
        "FlexibleTimeWindow": {"Mode": "OFF"},
        "ActionAfterCompletion": "DELETE",
        "Target": service._schedule_target(payload, fake_config),
    }


def transaction_keys(transaction):
    keys = []
    for operation in transaction:
        kind, request = next(iter(operation.items()))
        raw = request.get("Key")
        if raw is None:
            item = decode_item(request["Item"])
            if "pk" in item:
                raw_key = {"pk": item["pk"], "sk": item["sk"]}
            elif "sk" in item:
                raw_key = {"item_id": item["item_id"], "sk": item["sk"]}
            else:
                raw_key = {"item_id": item["item_id"]}
        else:
            raw_key = decode_item(raw)
        keys.append((request["TableName"], tuple(sorted(raw_key.items()))))
    return keys


def assert_expression_values_are_used(transaction):
    for operation in transaction:
        if "Update" not in operation:
            continue
        request = operation["Update"]
        expressions = " ".join(
            str(request.get(name, ""))
            for name in ("UpdateExpression", "ConditionExpression")
        )
        assert all(
            placeholder in expressions
            for placeholder in request.get("ExpressionAttributeValues", {})
        )


def rest_event(method, path, body=None, sub="seller-sub", groups="SELLER"):
    event = {
        "httpMethod": method,
        "path": path,
        "headers": {"Content-Type": "application/json"},
        "requestContext": {
            "authorizer": {
                "claims": {"sub": sub, "cognito:groups": groups},
            }
        },
    }
    if body is not None:
        event["body"] = body if isinstance(body, str) else json.dumps(body)
    return event


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


@pytest.mark.parametrize(
    ("identity", "session_value", "rules_value", "items", "start", "error_code"),
    [
        (seller(), None, {}, [{}], 1100, "SESSION_NOT_FOUND"),
        (seller(), {"seller_sub": "other", "status": "DRAFT"}, {}, [{}], 1100, "FORBIDDEN"),
        (seller(), {"seller_sub": "seller-sub", "status": "LIVE"}, {}, [{}], 1100, "SESSION_NOT_DRAFT"),
        (seller(), {"seller_sub": "seller-sub", "status": "DRAFT"}, None, [{}], 1100, "RULES_REQUIRED"),
        (seller(), {"seller_sub": "seller-sub", "status": "DRAFT"}, {}, [], 1100, "ITEM_REQUIRED"),
        (seller(), {"seller_sub": "seller-sub", "status": "DRAFT"}, {}, [{}], 1000, "START_TIME_INVALID"),
    ],
)
def test_schedule_requires_owner_draft_rules_items_and_future_start(
    identity, session_value, rules_value, items, start, error_code
):
    with pytest.raises((BadRequest, Conflict, Forbidden, NotFound)) as caught:
        service._validate_schedule(
            identity, session_value, rules_value, items, start, now=1000
        )
    assert caught.value.code == error_code


@pytest.mark.parametrize(
    "identity",
    [
        RequestIdentity(sub="seller-sub", groups=frozenset({"ADMIN"})),
        RequestIdentity(
            sub="another-seller",
            groups=frozenset({"ADMIN", "SELLER"}),
        ),
    ],
)
def test_schedule_rejects_admin_override_without_matching_seller(identity):
    with pytest.raises(Forbidden):
        service._validate_schedule(
            identity,
            {"seller_sub": "seller-sub", "status": "DRAFT"},
            {},
            [{}],
            1001,
            now=1000,
        )


def test_schedule_names_payload_and_target_are_deterministic(fake_config):
    payload = {"command": "START_SESSION", "session_id": "s1"}

    assert service._start_schedule_name("s1") == "start-session-s1"
    assert service._close_schedule_name("i1", 1_700_000_060) == (
        "close-item-i1-1700000060"
    )
    assert service._schedule_target(payload, fake_config) == {
        "Arn": fake_config.ADMIN_COMMAND_ARN,
        "RoleArn": fake_config.SCHEDULER_ROLE_ARN,
        "Input": json.dumps(payload, separators=(",", ":")),
        "DeadLetterConfig": {"Arn": fake_config.SCHEDULER_DLQ_ARN},
        "RetryPolicy": {
            "MaximumEventAgeInSeconds": 3600,
            "MaximumRetryAttempts": 3,
        },
    }


def test_put_schedule_uses_exact_one_time_schedule_request(fake_config):
    scheduler = FakeScheduler()
    payload = {
        "command": "CLOSE_ITEM",
        "item_id": "i1",
        "expected_end_epoch": 1_700_000_060,
    }

    service._put_schedule(
        "close-item-i1-1700000060",
        1_700_000_060,
        payload,
        scheduler=scheduler,
        config=fake_config,
    )

    assert scheduler.create_calls == [
        {
            "Name": "close-item-i1-1700000060",
            "GroupName": "la-lifecycle",
            "ScheduleExpression": "at(2023-11-14T22:14:20)",
            "ScheduleExpressionTimezone": "UTC",
            "State": "ENABLED",
            "FlexibleTimeWindow": {"Mode": "OFF"},
            "Target": service._schedule_target(payload, fake_config),
            "ActionAfterCompletion": "DELETE",
            "ClientToken": scheduler.create_calls[0]["ClientToken"],
        }
    ]
    assert len(scheduler.create_calls[0]["ClientToken"]) <= 64
    repeat = FakeScheduler()
    service._put_schedule(
        "close-item-i1-1700000060",
        1_700_000_060,
        payload,
        scheduler=repeat,
        config=fake_config,
    )
    assert repeat.create_calls[0]["ClientToken"] == scheduler.create_calls[0][
        "ClientToken"
    ]


def test_put_schedule_accepts_only_exact_existing_expression_and_target(fake_config):
    payload = {"command": "START_SESSION", "session_id": "s1"}
    target = service._schedule_target(payload, fake_config)
    scheduler = FakeScheduler(
        create_error=client_error("ConflictException", "CreateSchedule"),
        existing={
            **exact_existing_schedule(
                payload,
                fake_config,
                "at(2023-11-14T22:15:00)",
            ),
            "Name": "start-session-s1",
            "GroupName": "la-lifecycle",
            "Arn": "ignored-metadata",
        },
    )

    service._put_schedule(
        "start-session-s1",
        1_700_000_100,
        payload,
        scheduler=scheduler,
        config=fake_config,
    )

    assert scheduler.get_calls == [
        {"Name": "start-session-s1", "GroupName": "la-lifecycle"}
    ]


@pytest.mark.parametrize(
    "mismatch",
    ["expression", "target", "timezone", "state", "window", "action"],
)
def test_put_schedule_rejects_existing_name_mismatch(fake_config, mismatch):
    payload = {"command": "START_SESSION", "session_id": "s1"}
    existing = exact_existing_schedule(
        payload,
        fake_config,
        "at(2023-11-14T22:15:00)",
    )
    if mismatch == "expression":
        existing["ScheduleExpression"] = "at(2023-11-14T22:16:00)"
    elif mismatch == "target":
        existing["Target"] = {**existing["Target"], "Input": "{}"}
    elif mismatch == "timezone":
        existing["ScheduleExpressionTimezone"] = "Asia/Bangkok"
    elif mismatch == "state":
        existing["State"] = "DISABLED"
    elif mismatch == "window":
        existing["FlexibleTimeWindow"] = {
            "Mode": "FLEXIBLE",
            "MaximumWindowInMinutes": 5,
        }
    else:
        existing["ActionAfterCompletion"] = "NONE"
    scheduler = FakeScheduler(
        create_error=client_error("ConflictException", "CreateSchedule"),
        existing=existing,
    )

    with pytest.raises(Conflict) as caught:
        service._put_schedule(
            "start-session-s1",
            1_700_000_100,
            payload,
            scheduler=scheduler,
            config=fake_config,
        )

    assert caught.value.code == "SCHEDULE_NAME_CONFLICT"


def test_ambiguous_schedule_create_accepts_exact_record_and_keeps_scheduled_state(
    fake_config,
):
    class RecordedThenTimedOutScheduler(FakeScheduler):
        def create_schedule(self, **kwargs):
            self.create_calls.append(kwargs)
            self.existing = {
                key: value
                for key, value in kwargs.items()
                if key not in {"ClientToken", "Name", "GroupName"}
            }
            raise TimeoutError("create outcome is unknown")

    catalog = FakeTable(
        "catalog",
        records=key_map(
            (session_key("s1"), session()),
            (rules_key("s1"), rules()),
        ),
        query_responses=[{"Items": [catalog_item()]}],
    )
    scheduler = RecordedThenTimedOutScheduler()

    result = service._schedule_session(
        seller(),
        "s1",
        1_700_000_100,
        catalog,
        scheduler,
        fake_config,
        now=1_700_000_000,
    )

    assert result["status"] == "SCHEDULED"
    assert len(catalog.update_calls) == 1
    assert scheduler.get_calls == [
        {"Name": "start-session-s1", "GroupName": "la-lifecycle"}
    ]


def test_unknown_schedule_lookup_requires_reconciliation_without_rollback(fake_config):
    catalog = FakeTable(
        "catalog",
        records=key_map(
            (session_key("s1"), session()),
            (rules_key("s1"), rules()),
        ),
        query_responses=[{"Items": [catalog_item()]}],
    )
    scheduler = FakeScheduler(
        create_error=TimeoutError("create outcome is unknown"),
        get_error=client_error("ServiceUnavailableException", "GetSchedule"),
    )

    with pytest.raises(Conflict) as caught:
        service._schedule_session(
            seller(),
            "s1",
            1_700_000_100,
            catalog,
            scheduler,
            fake_config,
            now=1_700_000_000,
        )

    assert caught.value.code == "SCHEDULE_RECONCILIATION_REQUIRED"
    assert len(catalog.update_calls) == 1


def test_definitively_missing_schedule_propagates_original_create_failure(fake_config):
    create_error = TimeoutError("create failed")
    scheduler = FakeScheduler(
        create_error=create_error,
        get_error=client_error("ResourceNotFoundException", "GetSchedule"),
    )

    with pytest.raises(TimeoutError) as caught:
        service._put_schedule(
            "start-session-s1",
            1_700_000_100,
            {"command": "START_SESSION", "session_id": "s1"},
            scheduler=scheduler,
            config=fake_config,
        )

    assert caught.value is create_error
    assert scheduler.get_calls == [
        {"Name": "start-session-s1", "GroupName": "la-lifecycle"}
    ]


def test_transaction_token_is_deterministic_and_within_36_char_limit():
    first = service._transaction_token("open", "s1", "i1", 7)
    second = service._transaction_token("open", "s1", "i1", 7)

    assert first == second
    assert first.startswith("open-")
    assert len(first) <= 36


@pytest.mark.parametrize("value", [7, Decimal("7")])
def test_persisted_integer_normalizer_accepts_only_integral_values(value):
    assert service._persisted_int(
        value,
        "test value",
        minimum=1,
        maximum=10,
    ) == 7


@pytest.mark.parametrize(
    "value",
    [True, Decimal("1.5"), Decimal("NaN"), None, 0, 11],
)
def test_persisted_integer_normalizer_rejects_invalid_values(value):
    with pytest.raises(Conflict) as caught:
        service._persisted_int(
            value,
            "test value",
            minimum=1,
            maximum=10,
        )

    assert caught.value.code == "PERSISTED_VALUE_INVALID"


def test_rules_snapshot_rejects_fractional_persisted_integer():
    persisted_rules = dynamo_round_trip(rules())
    persisted_rules["anti_snipe_window_s"] = Decimal("30.5")

    with pytest.raises(Conflict) as caught:
        service._rules_snapshot(persisted_rules)

    assert caught.value.code == "PERSISTED_VALUE_INVALID"


def test_dynamo_client_token_hashes_complete_transaction_request():
    domain_token = service._transaction_token("pause", "s1", "i1", 3)

    def transaction(actor_sub, now_ms):
        event = service._operator_event(
            "ITEM_PAUSED",
            catalog_item(status="LIVE"),
            domain_token,
            1_700_000_000,
            now_ms,
            "PAUSED",
            actor_sub,
        )
        event["Put"]["TableName"] = "events"
        return [
            {
                "Update": {
                    "TableName": "state",
                    "Key": {"item_id": {"S": "i1"}},
                    "UpdateExpression": "SET #status = :status",
                    "ExpressionAttributeNames": {"#status": "status"},
                    "ExpressionAttributeValues": {":status": {"S": "PAUSED"}},
                }
            },
            event,
        ]

    original = transaction("admin-a", 1_700_000_000_100)
    identical = copy.deepcopy(original)
    different_time = transaction("admin-a", 1_700_000_000_101)
    different_actor = transaction("admin-b", 1_700_000_000_100)

    token = service._dynamo_client_token(original)
    assert token == service._dynamo_client_token(identical)
    assert token != service._dynamo_client_token(different_time)
    assert token != service._dynamo_client_token(different_actor)
    assert len(token) <= 36


def test_next_waiting_item_selects_exactly_first_sequence():
    items = [
        {"item_id": "i2", "sequence_number": 2, "status": "WAITING"},
        {"item_id": "live", "sequence_number": 0, "status": "LIVE"},
        {"item_id": "i1", "sequence_number": 1, "status": "WAITING"},
    ]

    assert service._next_waiting_item(items)["item_id"] == "i1"


def test_repeated_start_observes_live_state_as_idempotent_success():
    assert service._start_result(
        {"status": "LIVE", "active_item_id": "i1"}
    ) == {"status": "ALREADY_STARTED", "item_id": "i1"}


@pytest.mark.parametrize(
    ("state_value", "item_status"),
    [
        (active_state(status="PAUSED"), "LIVE"),
        (None, "LIVE"),
        (active_state(session_id="other-session"), "LIVE"),
        (active_state(), "PAUSED"),
        (active_state(version=0), "LIVE"),
    ],
)
def test_live_start_retry_rejects_inconsistent_active_records(
    fake_config, state_value, item_status
):
    item = catalog_item(status=item_status, version=3)
    catalog = FakeTable(
        "catalog",
        records=key_map(
            (
                session_key("s1"),
                session(
                    "LIVE",
                    version=5,
                    active_item_id="i1",
                    current_sequence=1,
                ),
            ),
            (item_lookup_key("i1"), lookup(item)),
            (item_key("s1", 1, "i1"), item),
        ),
    )
    state_table = FakeTable(
        "state",
        records=(
            key_map(({"item_id": "i1"}, state_value))
            if state_value is not None
            else {}
        ),
    )
    scheduler = FakeScheduler()

    with pytest.raises(Conflict) as caught:
        service._start_session(
            "s1",
            catalog,
            state_table,
            FakeTable("events"),
            scheduler,
            fake_config,
            now=1_700_000_000,
        )

    assert caught.value.code == "START_STATE_CONFLICT"
    assert scheduler.create_calls == []


def test_live_start_retry_strongly_validates_item_and_state_before_scheduling(
    fake_config,
):
    item = catalog_item(status="LIVE", version=3)
    catalog = FakeTable(
        "catalog",
        records=key_map(
            (
                session_key("s1"),
                session(
                    "LIVE",
                    version=5,
                    active_item_id="i1",
                    current_sequence=1,
                ),
            ),
            (item_lookup_key("i1"), lookup(item)),
            (item_key("s1", 1, "i1"), item),
        ),
    )
    state_table = FakeTable(
        "state",
        records=key_map(({"item_id": "i1"}, active_state(version=4))),
    )
    scheduler = FakeScheduler()

    result = service._start_session(
        "s1",
        catalog,
        state_table,
        FakeTable("events"),
        scheduler,
        fake_config,
        now=1_700_000_000,
    )

    assert result == {"status": "ALREADY_STARTED", "item_id": "i1"}
    assert [call["Key"] for call in catalog.get_calls] == [
        session_key("s1"),
        item_lookup_key("i1"),
        item_key("s1", 1, "i1"),
    ]
    assert all(call["ConsistentRead"] is True for call in catalog.get_calls)
    assert state_table.get_calls == [
        {"Key": {"item_id": "i1"}, "ConsistentRead": True}
    ]
    assert scheduler.create_calls[0]["Name"] == "close-item-i1-1700000060"


def test_live_start_retry_accepts_integral_dynamodb_decimal_records(fake_config):
    item = dynamo_round_trip(catalog_item(status="LIVE", version=3))
    live_session = dynamo_round_trip(
        session(
            "LIVE",
            version=5,
            active_item_id="i1",
            current_sequence=1,
        )
    )
    catalog = FakeTable(
        "catalog",
        records=key_map(
            (session_key("s1"), live_session),
            (item_lookup_key("i1"), dynamo_round_trip(lookup(item))),
            (item_key("s1", 1, "i1"), item),
        ),
    )
    state_table = FakeTable(
        "state",
        records=key_map(
            ({"item_id": "i1"}, dynamo_round_trip(active_state(version=4)))
        ),
    )
    scheduler = FakeScheduler()

    result = service._start_session(
        "s1",
        catalog,
        state_table,
        FakeTable("events"),
        scheduler,
        fake_config,
        now=1_700_000_000,
    )

    assert result == {"status": "ALREADY_STARTED", "item_id": "i1"}
    assert scheduler.create_calls[0]["Name"] == "close-item-i1-1700000060"


def test_schedule_session_reads_all_items_updates_then_creates_schedule(fake_config):
    first_item = catalog_item()
    catalog = FakeTable(
        "catalog",
        records=key_map(
            (session_key("s1"), session()),
            (rules_key("s1"), rules()),
        ),
        query_responses=[
            {"Items": [], "LastEvaluatedKey": {"pk": "cursor", "sk": "cursor"}},
            {"Items": [first_item]},
        ],
    )
    scheduler = FakeScheduler()

    result = service._schedule_session(
        seller(),
        "s1",
        1_700_000_100,
        catalog,
        scheduler,
        fake_config,
        now=1_700_000_000,
    )

    assert result == {
        "session_id": "s1",
        "status": "SCHEDULED",
        "start_time": 1_700_000_100,
    }
    assert all(call["ConsistentRead"] is True for call in catalog.get_calls)
    assert len(catalog.query_calls) == 2
    assert all(call["ConsistentRead"] is True for call in catalog.query_calls)
    assert catalog.update_calls[0]["ConditionExpression"] == (
        "#status = :draft AND version = :expected"
    )
    assert catalog.update_calls[0]["ExpressionAttributeValues"][":expected"] == 4
    assert catalog.update_calls[0]["ExpressionAttributeValues"][":gsi2sk"] == (
        "STATUS#SCHEDULED#START#1700000100#s1"
    )
    assert scheduler.create_calls[0]["Target"]["Input"] == (
        '{"command":"START_SESSION","session_id":"s1"}'
    )


def test_schedule_creation_failure_rolls_back_to_original_draft_version(fake_config):
    catalog = FakeTable(
        "catalog",
        records=key_map(
            (session_key("s1"), session()),
            (rules_key("s1"), rules()),
        ),
        query_responses=[{"Items": [catalog_item()]}],
    )
    scheduler = FakeScheduler(
        create_error=client_error("ThrottlingException", "CreateSchedule"),
        get_error=client_error("ResourceNotFoundException", "GetSchedule"),
    )

    with pytest.raises(ClientError):
        service._schedule_session(
            seller(),
            "s1",
            1_700_000_100,
            catalog,
            scheduler,
            fake_config,
            now=1_700_000_000,
        )

    rollback = catalog.update_calls[1]
    assert rollback["ConditionExpression"] == (
        "#status = :scheduled AND version = :scheduled_version "
        "AND start_time = :start_time"
    )
    assert rollback["ExpressionAttributeValues"][":draft_version"] == 4
    assert "REMOVE start_time" in rollback["UpdateExpression"]


def test_schedule_rollback_condition_loss_requires_reconciliation(fake_config):
    conditional = client_error("ConditionalCheckFailedException", "UpdateItem")
    catalog = FakeTable(
        "catalog",
        records=key_map(
            (session_key("s1"), session()),
            (rules_key("s1"), rules()),
        ),
        query_responses=[{"Items": [catalog_item()]}],
        update_errors=[None, conditional],
    )
    scheduler = FakeScheduler(
        create_error=client_error("ThrottlingException", "CreateSchedule"),
        get_error=client_error("ResourceNotFoundException", "GetSchedule"),
    )

    with pytest.raises(Conflict) as caught:
        service._schedule_session(
            seller(),
            "s1",
            1_700_000_100,
            catalog,
            scheduler,
            fake_config,
            now=1_700_000_000,
        )

    assert caught.value.code == "SCHEDULE_RECONCILIATION_REQUIRED"


def test_schedule_rollback_aws_failure_requires_reconciliation(fake_config):
    rollback_error = client_error(
        "ProvisionedThroughputExceededException",
        "UpdateItem",
        message="internal rollback details",
    )
    catalog = FakeTable(
        "catalog",
        records=key_map(
            (session_key("s1"), session()),
            (rules_key("s1"), rules()),
        ),
        query_responses=[{"Items": [catalog_item()]}],
        update_errors=[None, rollback_error],
    )
    scheduler = FakeScheduler(
        create_error=client_error("ThrottlingException", "CreateSchedule"),
        get_error=client_error("ResourceNotFoundException", "GetSchedule"),
    )

    with pytest.raises(Conflict) as caught:
        service._schedule_session(
            seller(),
            "s1",
            1_700_000_100,
            catalog,
            scheduler,
            fake_config,
            now=1_700_000_000,
        )

    assert caught.value.code == "SCHEDULE_RECONCILIATION_REQUIRED"
    assert caught.value.message == "Schedule state needs repair"
    assert caught.value.__cause__ is rollback_error
    assert "internal rollback details" not in caught.value.message


def test_start_accepts_integral_dynamodb_decimal_catalog_and_rules(fake_config):
    persisted_session = dynamo_round_trip(session("SCHEDULED"))
    persisted_rules = dynamo_round_trip(rules())
    persisted_item = dynamo_round_trip(catalog_item())
    client = FakeClient()
    catalog = FakeTable(
        "catalog",
        records=key_map(
            (session_key("s1"), persisted_session),
            (rules_key("s1"), persisted_rules),
        ),
        query_responses=[{"Items": [persisted_item]}],
        client=client,
    )

    result = service._start_session(
        "s1",
        catalog,
        FakeTable("state", client=client),
        FakeTable("events", client=client),
        FakeScheduler(),
        fake_config,
        now=1_700_000_000,
    )

    assert result == {"status": "STARTED", "item_id": "i1"}
    state = decode_item(client.transact_calls[0]["TransactItems"][2]["Put"]["Item"])
    assert state["end_time"] == Decimal("1700000060")
    assert state["anti_snipe_window_s"] == Decimal("30")


def test_start_transaction_opens_first_item_with_rule_snapshot_and_event(fake_config):
    first = catalog_item()
    second = catalog_item("i2", 2)
    client = FakeClient()
    catalog = FakeTable(
        "catalog",
        records=key_map(
            (session_key("s1"), session("SCHEDULED")),
            (rules_key("s1"), rules()),
        ),
        query_responses=[{"Items": [second, first]}],
        client=client,
    )
    state_table = FakeTable("state", client=client)
    events = FakeTable("events", client=client)
    scheduler = FakeScheduler()

    result = service._start_session(
        "s1",
        catalog,
        state_table,
        events,
        scheduler,
        fake_config,
        now=1_700_000_000,
        now_ms=1_700_000_000_123,
    )

    assert result == {"status": "STARTED", "item_id": "i1"}
    call = client.transact_calls[0]
    assert len(call["ClientRequestToken"]) <= 36
    transaction = call["TransactItems"]
    assert len(transaction_keys(transaction)) == len(set(transaction_keys(transaction)))
    session_update = transaction[0]["Update"]
    assert session_update["ConditionExpression"] == (
        "#status = :scheduled AND version = :session_version"
    )
    item_update = transaction[1]["Update"]
    assert decode_item(item_update["Key"]) == item_key("s1", 1, "i1")
    state_put = decode_item(transaction[2]["Put"]["Item"])
    assert state_put == {
        "item_id": "i1",
        "session_id": "s1",
        "status": "LIVE",
        "seller_sub": "seller-sub",
        "current_price": Decimal("100"),
        "end_time": 1_700_000_060,
        "owner_region": "ap-southeast-1",
        "extension_count": 0,
        "version": 1,
        "min_increment": Decimal("1"),
        "max_increment": Decimal("1000"),
        "anti_snipe_window_s": 30,
        "anti_snipe_extend_s": 60,
        "max_extensions": 10,
        "public_history_limit": 20,
    }
    event = decode_item(transaction[3]["Put"]["Item"])
    assert event["item_id"] == "i1"
    domain_token = service._transaction_token("open", "s1", "i1", 4)
    assert event["sk"] == (
        f"1700000000123#ITEM_OPENED#{domain_token}"
    )
    assert call["ClientRequestToken"] != domain_token
    assert call["ClientRequestToken"] == service._dynamo_client_token(transaction)
    assert event["event_type"] == "ITEM_OPENED"
    assert scheduler.create_calls[0]["Target"]["Input"] == (
        '{"command":"CLOSE_ITEM","item_id":"i1",'
        '"expected_end_epoch":1700000060}'
    )


def test_start_transaction_cancellation_observes_committed_live_state(fake_config):
    cancellation = client_error(
        "TransactionCanceledException",
        "TransactWriteItems",
        reasons=[{"Code": "ConditionalCheckFailed"}] + [{"Code": "None"}] * 3,
    )
    client = FakeClient(transaction_error=cancellation)
    before = dynamo_round_trip(session("SCHEDULED"))
    after = dynamo_round_trip(
        session("LIVE", version=5, active_item_id="i1", current_sequence=1)
    )
    waiting_item = dynamo_round_trip(catalog_item())
    committed_item = dynamo_round_trip(catalog_item(status="LIVE", version=3))
    catalog = FakeTable(
        "catalog",
        records=key_map(
            (rules_key("s1"), dynamo_round_trip(rules())),
        ),
        query_responses=[{"Items": [waiting_item]}],
        client=client,
    )
    session_responses = iter(({"Item": before}, {"Item": after}))

    def get_item(**kwargs):
        if kwargs["Key"] == rules_key("s1"):
            return {"Item": dynamo_round_trip(rules())}
        if kwargs["Key"] == item_lookup_key("i1"):
            return {"Item": dynamo_round_trip(lookup(committed_item))}
        if kwargs["Key"] == item_key("s1", 1, "i1"):
            return {"Item": committed_item}
        return next(session_responses)

    catalog.get_item = get_item
    state_table = FakeTable(
        "state",
        records=key_map(
            ({"item_id": "i1"}, dynamo_round_trip(active_state()))
        ),
        client=client,
    )
    scheduler = FakeScheduler()

    result = service._start_session(
        "s1",
        catalog,
        state_table,
        FakeTable("events", client=client),
        scheduler,
        fake_config,
        now=1_700_000_000,
    )

    assert result == {"status": "ALREADY_STARTED", "item_id": "i1"}
    assert scheduler.create_calls


def test_stale_close_reschedules_actual_new_end_without_transaction(fake_config):
    current = catalog_item(status="LIVE")
    client = FakeClient()
    catalog = FakeTable(
        "catalog",
        records=key_map(
            (item_lookup_key("i1"), lookup(current)),
            (item_key("s1", 1, "i1"), current),
            (session_key("s1"), session("LIVE", active_item_id="i1")),
            (rules_key("s1"), rules()),
        ),
        client=client,
    )
    state_table = FakeTable(
        "state",
        records=key_map(
            (
                {"item_id": "i1"},
                active_state(end_time=1_700_000_120),
            )
        ),
        client=client,
    )
    scheduler = FakeScheduler()

    result = service._close_item(
        "i1",
        1_700_000_060,
        catalog,
        state_table,
        FakeTable("events", client=client),
        scheduler,
        fake_config,
        now=1_700_000_060,
    )

    assert result == {"status": "RESCHEDULED", "end_time": 1_700_000_120}
    assert client.transact_calls == []
    assert scheduler.create_calls[0]["Name"] == "close-item-i1-1700000120"


def test_close_decision_terminal_status_and_after_close_helpers():
    assert service._close_decision(
        {"status": "LIVE", "end_time": 1200}, 1100, now=1100
    ) == {"status": "RESCHEDULED", "end_time": 1200}
    assert service._close_decision(
        {"status": "UNSOLD", "end_time": 1000}, 1000, now=1100
    ) == {"status": "ALREADY_CLOSED", "terminal_status": "UNSOLD"}
    assert service._terminal_status({"current_price": 100}) == "UNSOLD"
    assert service._terminal_status(
        {"current_price": 110, "highest_bidder_id": "bidder-sub"}
    ) == "PENDING_ADMIN_APPROVAL"
    assert service._after_close({"item_id": "i2"}) == {
        "session_status": "LIVE",
        "next_item_id": "i2",
    }
    assert service._after_close(None) == {
        "session_status": "COMPLETED",
        "next_item_id": None,
    }


@pytest.mark.parametrize(
    ("highest_bidder", "expected_status"),
    [(None, "UNSOLD"), ("bidder-sub", "PENDING_ADMIN_APPROVAL")],
)
def test_close_commits_terminal_result_and_opens_next(
    fake_config, highest_bidder, expected_status
):
    current = catalog_item(status="LIVE")
    next_item = catalog_item("i2", 2)
    client = FakeClient()
    catalog = FakeTable(
        "catalog",
        records=key_map(
            (item_lookup_key("i1"), lookup(current)),
            (item_key("s1", 1, "i1"), current),
            (session_key("s1"), session("LIVE", active_item_id="i1")),
            (rules_key("s1"), rules()),
        ),
        query_responses=[{"Items": [current, next_item]}],
        client=client,
    )
    state_value = active_state(end_time=1_700_000_000)
    if highest_bidder is not None:
        state_value.update(
            current_price=Decimal("125"), highest_bidder_id=highest_bidder
        )
    state_table = FakeTable(
        "state",
        records=key_map(({"item_id": "i1"}, state_value)),
        client=client,
    )
    events = FakeTable("events", client=client)
    scheduler = FakeScheduler()

    result = service._close_item(
        "i1",
        1_700_000_000,
        catalog,
        state_table,
        events,
        scheduler,
        fake_config,
        now=1_700_000_001,
        now_ms=1_700_000_001_234,
    )

    assert result == {
        "status": "CLOSED",
        "terminal_status": expected_status,
        "next_item_id": "i2",
        "session_status": "LIVE",
    }
    transaction = client.transact_calls[0]["TransactItems"]
    assert len(transaction_keys(transaction)) == len(set(transaction_keys(transaction)))
    assert decode_item(transaction[0]["Update"]["ExpressionAttributeValues"])[
        ":terminal"
    ] == expected_status
    current_update = transaction[1]["Update"]
    current_values = decode_item(current_update["ExpressionAttributeValues"])
    assert current_values[":terminal"] == expected_status
    assert current_values[":final_price"] == state_value["current_price"]
    assert current_values[":winner_sub"] == (highest_bidder or "")
    event = decode_item(transaction[2]["Put"]["Item"])
    assert event["event_type"] == "ITEM_CLOSED"
    session_update = transaction[3]["Update"]
    assert session_update["ConditionExpression"] == (
        "#status = :session_live AND active_item_id = :current_item_id "
        "AND version = :version"
    )
    next_state = decode_item(transaction[-2]["Put"]["Item"])
    assert next_state["item_id"] == "i2"
    assert next_state["seller_sub"] == "seller-sub"
    opened_event = decode_item(transaction[-1]["Put"]["Item"])
    open_token = service._transaction_token("open", "s1", "i2", 4)
    assert opened_event == {
        "item_id": "i2",
        "sk": f"1700000001234#ITEM_OPENED#{open_token}",
        "event_type": "ITEM_OPENED",
        "session_id": "s1",
        "status": "LIVE",
        "timestamp": 1_700_000_001,
    }
    assert scheduler.create_calls[0]["Name"] == "close-item-i2-1700000061"


def test_close_without_next_item_completes_session(fake_config):
    current = catalog_item(status="LIVE")
    client = FakeClient()
    catalog = FakeTable(
        "catalog",
        records=key_map(
            (item_lookup_key("i1"), lookup(current)),
            (item_key("s1", 1, "i1"), current),
            (session_key("s1"), session("LIVE", active_item_id="i1")),
            (rules_key("s1"), rules()),
        ),
        query_responses=[{"Items": [current]}],
        client=client,
    )
    state_table = FakeTable(
        "state",
        records=key_map(
            ({"item_id": "i1"}, active_state(end_time=1_700_000_000))
        ),
        client=client,
    )
    scheduler = FakeScheduler()

    result = service._close_item(
        "i1",
        1_700_000_000,
        catalog,
        state_table,
        FakeTable("events", client=client),
        scheduler,
        fake_config,
        now=1_700_000_001,
    )

    assert result["session_status"] == "COMPLETED"
    assert result["next_item_id"] is None
    session_update = client.transact_calls[0]["TransactItems"][3]["Update"]
    assert "REMOVE active_item_id, current_sequence" in session_update[
        "UpdateExpression"
    ]
    assert scheduler.create_calls == []


def test_close_accepts_integral_dynamodb_decimal_records(fake_config):
    current = dynamo_round_trip(catalog_item(status="LIVE"))
    live_session = dynamo_round_trip(
        session(
            "LIVE",
            active_item_id="i1",
            current_sequence=1,
        )
    )
    client = FakeClient()
    catalog = FakeTable(
        "catalog",
        records=key_map(
            (item_lookup_key("i1"), dynamo_round_trip(lookup(current))),
            (item_key("s1", 1, "i1"), current),
            (session_key("s1"), live_session),
            (rules_key("s1"), dynamo_round_trip(rules())),
        ),
        query_responses=[{"Items": [current]}],
        client=client,
    )
    state_table = FakeTable(
        "state",
        records=key_map(
            (
                {"item_id": "i1"},
                dynamo_round_trip(active_state(end_time=1_700_000_000)),
            )
        ),
        client=client,
    )

    result = service._close_item(
        "i1",
        1_700_000_000,
        catalog,
        state_table,
        FakeTable("events", client=client),
        FakeScheduler(),
        fake_config,
        now=1_700_000_001,
    )

    assert result == {
        "status": "CLOSED",
        "terminal_status": "UNSOLD",
        "next_item_id": None,
        "session_status": "COMPLETED",
    }
    assert client.transact_calls[0]["ClientRequestToken"] == (
        service._dynamo_client_token(client.transact_calls[0]["TransactItems"])
    )


def test_repeated_close_reports_committed_terminal_state_without_writes(fake_config):
    current = catalog_item(status="UNSOLD")
    client = FakeClient()
    catalog = FakeTable(
        "catalog",
        records=key_map(
            (item_lookup_key("i1"), lookup(current)),
            (item_key("s1", 1, "i1"), current),
            (session_key("s1"), session("COMPLETED")),
        ),
        client=client,
    )
    state_table = FakeTable(
        "state",
        records=key_map(({"item_id": "i1"}, active_state(status="UNSOLD"))),
        client=client,
    )

    result = service._close_item(
        "i1",
        1_700_000_060,
        catalog,
        state_table,
        FakeTable("events", client=client),
        FakeScheduler(),
        fake_config,
        now=1_700_000_100,
    )

    assert result == {"status": "ALREADY_CLOSED", "terminal_status": "UNSOLD"}
    assert client.transact_calls == []


@pytest.mark.parametrize("command", ["pause", "resume", "approve", "close", "cancel"])
def test_operator_commands_require_admin_group(command):
    with pytest.raises(Forbidden):
        service._require_operator(seller(), command)


@pytest.mark.parametrize(
    ("command", "before", "after"),
    [
        ("pause", "LIVE", "PAUSED"),
        ("resume", "PAUSED", "LIVE"),
        ("approve", "PENDING_ADMIN_APPROVAL", "SOLD"),
        ("close", "LIVE", "CLOSED"),
        ("close", "PAUSED", "CLOSED"),
        ("cancel", "WAITING", "CANCELLED"),
        ("cancel", "LIVE", "CANCELLED"),
        ("cancel", "PAUSED", "CANCELLED"),
    ],
)
def test_operator_transition_matrix_is_explicit(command, before, after):
    assert service._operator_transition(command, before) == after


@pytest.mark.parametrize(
    ("command", "before"),
    [
        ("pause", "PAUSED"),
        ("resume", "WAITING"),
        ("approve", "UNSOLD"),
        ("close", "WAITING"),
        ("cancel", "SOLD"),
    ],
)
def test_operator_transition_matrix_rejects_unapproved_transition(command, before):
    with pytest.raises(Conflict) as caught:
        service._operator_transition(command, before)
    assert caught.value.code == "INVALID_ITEM_TRANSITION"


def operation_tables(status, state_value=None, query_items=None):
    current = dynamo_round_trip(catalog_item(status=status))
    if state_value is not None:
        state_value = dynamo_round_trip(state_value)
    if state_value is not None:
        for field in ("winner_sub", "final_price"):
            if field in state_value:
                current[field] = state_value[field]
    client = FakeClient()
    catalog = FakeTable(
        "catalog",
        records=key_map(
            (item_lookup_key("i1"), dynamo_round_trip(lookup(current))),
            (item_key("s1", 1, "i1"), current),
            (
                session_key("s1"),
                dynamo_round_trip(session("LIVE", active_item_id="i1")),
            ),
            (rules_key("s1"), dynamo_round_trip(rules())),
        ),
        query_responses=[{"Items": query_items or [current]}],
        client=client,
    )
    state_table = FakeTable(
        "state",
        records=(
            key_map(({"item_id": "i1"}, state_value))
            if state_value is not None
            else {}
        ),
        client=client,
    )
    return client, catalog, state_table, FakeTable("events", client=client)


def test_pause_stores_remaining_seconds_writes_one_event_and_deletes_schedule(fake_config):
    client, catalog, state_table, events = operation_tables(
        "LIVE", active_state(end_time=1_700_000_060)
    )
    scheduler = FakeScheduler()

    result = service._pause_item(
        admin(),
        "i1",
        catalog,
        state_table,
        events,
        scheduler,
        fake_config,
        now=1_700_000_000,
        now_ms=1_700_000_000_100,
    )

    assert result == {"status": "PAUSED", "item_id": "i1", "remaining_seconds": 60}
    transaction = client.transact_calls[0]["TransactItems"]
    assert len(transaction_keys(transaction)) == len(set(transaction_keys(transaction)))
    state_values = decode_item(transaction[0]["Update"]["ExpressionAttributeValues"])
    assert state_values[":remaining"] == 60
    assert all(
        key.startswith(":")
        for operation in transaction
        if "Update" in operation
        for key in operation["Update"]["ExpressionAttributeValues"]
    )
    assert decode_item(transaction[2]["Put"]["Item"])["event_type"] == "ITEM_PAUSED"
    assert scheduler.delete_calls == [
        {"Name": "close-item-i1-1700000060", "GroupName": "la-lifecycle"}
    ]


def test_resume_sets_new_end_writes_one_event_and_schedules_close(fake_config):
    client, catalog, state_table, events = operation_tables(
        "PAUSED", active_state(status="PAUSED", remaining_seconds=45)
    )
    scheduler = FakeScheduler()

    result = service._resume_item(
        admin(),
        "i1",
        catalog,
        state_table,
        events,
        scheduler,
        fake_config,
        now=1_700_000_000,
        now_ms=1_700_000_000_100,
    )

    assert result == {"status": "LIVE", "item_id": "i1", "end_time": 1_700_000_045}
    transaction = client.transact_calls[0]["TransactItems"]
    state_values = decode_item(transaction[0]["Update"]["ExpressionAttributeValues"])
    assert state_values[":end_time"] == 1_700_000_045
    assert decode_item(transaction[2]["Put"]["Item"])["event_type"] == "ITEM_RESUMED"
    assert scheduler.create_calls[0]["Name"] == "close-item-i1-1700000045"


def test_approve_retains_winner_and_final_price(fake_config):
    client, catalog, state_table, events = operation_tables(
        "PENDING_ADMIN_APPROVAL",
        active_state(
            status="PENDING_ADMIN_APPROVAL",
            current_price=Decimal("150"),
            highest_bidder_id="winner-sub",
            final_price=Decimal("150"),
            winner_sub="winner-sub",
        ),
    )

    result = service._approve_item(
        admin(),
        "i1",
        catalog,
        state_table,
        events,
        fake_config,
        now=1_700_000_000,
        now_ms=1_700_000_000_100,
    )

    assert result == {
        "status": "SOLD",
        "item_id": "i1",
        "winner_sub": "winner-sub",
        "final_price": Decimal("150"),
    }
    transaction = client.transact_calls[0]["TransactItems"]
    for operation in transaction[:2]:
        values = decode_item(operation["Update"]["ExpressionAttributeValues"])
        assert values[":winner_sub"] == "winner-sub"
        assert values[":final_price"] == Decimal("150")
    assert decode_item(transaction[2]["Put"]["Item"])["event_type"] == "ITEM_APPROVED"


def test_approve_uses_committed_close_result_not_mutable_bid_fields(fake_config):
    client, catalog, state_table, events = operation_tables(
        "PENDING_ADMIN_APPROVAL",
        active_state(
            status="PENDING_ADMIN_APPROVAL",
            current_price=Decimal("999"),
            highest_bidder_id="later-bidder",
            final_price=Decimal("150"),
            winner_sub="committed-winner",
        ),
    )
    item_record = catalog.records[
        FakeTable._key(item_key("s1", 1, "i1"))
    ]
    item_record["final_price"] = Decimal("150")
    item_record["winner_sub"] = "committed-winner"

    result = service._approve_item(
        admin(),
        "i1",
        catalog,
        state_table,
        events,
        fake_config,
        now=1_700_000_000,
        now_ms=1_700_000_000_100,
    )

    assert result == {
        "status": "SOLD",
        "item_id": "i1",
        "winner_sub": "committed-winner",
        "final_price": Decimal("150"),
    }
    transaction = client.transact_calls[0]["TransactItems"]
    for operation in transaction[:2]:
        values = decode_item(operation["Update"]["ExpressionAttributeValues"])
        assert values[":winner_sub"] == "committed-winner"
        assert values[":final_price"] == Decimal("150")


def test_operator_force_close_allows_paused_item(fake_config):
    client, catalog, state_table, events = operation_tables(
        "PAUSED", active_state(status="PAUSED", remaining_seconds=30)
    )

    result = service._operator_close_item(
        admin(),
        "i1",
        catalog,
        state_table,
        events,
        FakeScheduler(),
        fake_config,
        now=1_700_000_000,
    )

    assert result["status"] == "CLOSED"
    condition = client.transact_calls[0]["TransactItems"][0]["Update"][
        "ConditionExpression"
    ]
    assert "#status IN (:live, :paused)" in condition
    assert "end_time <= :now" not in condition
    assert_expression_values_are_used(client.transact_calls[0]["TransactItems"])


def test_operator_close_retry_repairs_next_active_item_schedule(fake_config):
    closed = catalog_item(status="PENDING_ADMIN_APPROVAL", version=3)
    next_item = catalog_item("i2", 2, "LIVE", version=3)
    client = FakeClient()
    catalog = FakeTable(
        "catalog",
        records=key_map(
            (item_lookup_key("i1"), lookup(closed)),
            (item_key("s1", 1, "i1"), closed),
            (item_lookup_key("i2"), lookup(next_item)),
            (item_key("s1", 2, "i2"), next_item),
            (
                session_key("s1"),
                session(
                    "LIVE",
                    version=6,
                    active_item_id="i2",
                    current_sequence=2,
                ),
            ),
        ),
        client=client,
    )
    state_table = FakeTable(
        "state",
        records=key_map(
            (
                {"item_id": "i1"},
                active_state(
                    status="PENDING_ADMIN_APPROVAL",
                    version=4,
                    end_time=1_700_000_060,
                ),
            ),
            (
                {"item_id": "i2"},
                active_state(
                    item_id="i2",
                    status="LIVE",
                    version=1,
                    end_time=1_700_000_160,
                ),
            ),
        ),
        client=client,
    )
    scheduler = FakeScheduler()

    result = service._operator_close_item(
        admin(),
        "i1",
        catalog,
        state_table,
        FakeTable("events", client=client),
        scheduler,
        fake_config,
        now=1_700_000_100,
    )

    assert result == {
        "status": "ALREADY_CLOSED",
        "terminal_status": "PENDING_ADMIN_APPROVAL",
    }
    assert scheduler.create_calls[0]["Name"] == "close-item-i2-1700000160"
    assert client.transact_calls == []


def test_direct_close_retry_accepts_paused_successor_without_schedule(fake_config):
    closed = dynamo_round_trip(
        catalog_item(status="PENDING_ADMIN_APPROVAL", version=3)
    )
    successor = dynamo_round_trip(catalog_item("i2", 2, "PAUSED", version=4))
    client = FakeClient()
    catalog = FakeTable(
        "catalog",
        records=key_map(
            (item_lookup_key("i1"), dynamo_round_trip(lookup(closed))),
            (item_key("s1", 1, "i1"), closed),
            (item_lookup_key("i2"), dynamo_round_trip(lookup(successor))),
            (item_key("s1", 2, "i2"), successor),
            (
                session_key("s1"),
                dynamo_round_trip(
                    session(
                        "LIVE",
                        version=7,
                        active_item_id="i2",
                        current_sequence=2,
                    )
                ),
            ),
        ),
        client=client,
    )
    state_table = FakeTable(
        "state",
        records=key_map(
            (
                {"item_id": "i1"},
                dynamo_round_trip(
                    active_state(
                        status="PENDING_ADMIN_APPROVAL",
                        version=4,
                        end_time=1_700_000_060,
                    )
                ),
            ),
            (
                {"item_id": "i2"},
                dynamo_round_trip(
                    active_state(
                        item_id="i2",
                        status="PAUSED",
                        version=2,
                        end_time=1_700_000_160,
                        remaining_seconds=30,
                    )
                ),
            ),
        ),
        client=client,
    )
    scheduler = FakeScheduler()

    result = service._close_item(
        "i1",
        1_700_000_060,
        catalog,
        state_table,
        FakeTable("events", client=client),
        scheduler,
        fake_config,
        now=1_700_000_100,
    )

    assert result == {
        "status": "ALREADY_CLOSED",
        "terminal_status": "PENDING_ADMIN_APPROVAL",
    }
    assert scheduler.create_calls == []
    assert client.transact_calls == []


def test_close_cancellation_reconciles_committed_next_item_schedule(fake_config):
    transaction_error = client_error(
        "TransactionCanceledException",
        "TransactWriteItems",
        reasons=[{"Code": "ConditionalCheckFailed"}] + [{"Code": "None"}] * 5,
    )
    client = FakeClient(transaction_error=transaction_error)
    current_before = dynamo_round_trip(catalog_item(status="LIVE", version=2))
    current_after = dynamo_round_trip(
        catalog_item(
            status="PENDING_ADMIN_APPROVAL",
            version=3,
            final_price=Decimal("125"),
            winner_sub="winner-sub",
        )
    )
    next_before = dynamo_round_trip(catalog_item("i2", 2, "WAITING", version=2))
    next_after = dynamo_round_trip(catalog_item("i2", 2, "LIVE", version=3))
    session_before = dynamo_round_trip(
        session("LIVE", version=5, active_item_id="i1", current_sequence=1)
    )
    session_after = dynamo_round_trip(
        session("LIVE", version=6, active_item_id="i2", current_sequence=2)
    )
    catalog = FakeTable(
        "catalog",
        query_responses=[{"Items": [current_before, next_before]}],
        client=client,
    )
    current_items = iter((current_before, current_after))
    sessions = iter((session_before, session_after))

    def get_catalog_item(**kwargs):
        key = kwargs["Key"]
        if key == item_lookup_key("i1"):
            return {"Item": dynamo_round_trip(lookup(current_before))}
        if key == item_key("s1", 1, "i1"):
            return {"Item": next(current_items)}
        if key == session_key("s1"):
            return {"Item": next(sessions)}
        if key == rules_key("s1"):
            return {"Item": dynamo_round_trip(rules())}
        if key == item_lookup_key("i2"):
            return {"Item": dynamo_round_trip(lookup(next_after))}
        if key == item_key("s1", 2, "i2"):
            return {"Item": next_after}
        return {}

    catalog.get_item = get_catalog_item
    state_table = FakeTable("state", client=client)
    states = iter(
        (
            dynamo_round_trip(
                active_state(
                    status="LIVE",
                    version=3,
                    end_time=1_700_000_000,
                    current_price=Decimal("125"),
                    highest_bidder_id="winner-sub",
                )
            ),
            dynamo_round_trip(
                active_state(
                    status="PENDING_ADMIN_APPROVAL",
                    version=4,
                    end_time=1_700_000_000,
                    final_price=Decimal("125"),
                    winner_sub="winner-sub",
                )
            ),
            dynamo_round_trip(
                active_state(
                    item_id="i2",
                    status="LIVE",
                    version=1,
                    end_time=1_700_000_160,
                )
            ),
        )
    )
    state_table.get_item = lambda **_kwargs: {"Item": next(states)}
    scheduler = FakeScheduler()

    result = service._close_item(
        "i1",
        1_700_000_000,
        catalog,
        state_table,
        FakeTable("events", client=client),
        scheduler,
        fake_config,
        now=1_700_000_001,
    )

    assert result == {
        "status": "ALREADY_CLOSED",
        "terminal_status": "PENDING_ADMIN_APPROVAL",
    }
    assert scheduler.create_calls[0]["Name"] == "close-item-i2-1700000160"


def test_repeated_close_after_approval_reports_committed_sold_state(fake_config):
    current = catalog_item(status="SOLD")
    client = FakeClient()
    catalog = FakeTable(
        "catalog",
        records=key_map(
            (item_lookup_key("i1"), lookup(current)),
            (item_key("s1", 1, "i1"), current),
            (session_key("s1"), session("COMPLETED")),
        ),
        client=client,
    )
    state_table = FakeTable(
        "state",
        records=key_map(({"item_id": "i1"}, active_state(status="SOLD"))),
        client=client,
    )

    result = service._close_item(
        "i1",
        1_700_000_060,
        catalog,
        state_table,
        FakeTable("events", client=client),
        FakeScheduler(),
        fake_config,
        now=1_700_000_100,
    )

    assert result == {"status": "ALREADY_CLOSED", "terminal_status": "SOLD"}
    assert any(call["Key"] == session_key("s1") for call in catalog.get_calls)


def test_cancel_opens_next_waiting_item_atomically_and_writes_lifecycle_events(
    fake_config,
):
    current = catalog_item(status="LIVE")
    next_item = catalog_item("i2", 2)
    client, catalog, state_table, events = operation_tables(
        "LIVE",
        active_state(),
        query_items=[current, next_item],
    )
    scheduler = FakeScheduler()

    result = service._cancel_item(
        admin(),
        "i1",
        catalog,
        state_table,
        events,
        scheduler,
        fake_config,
        now=1_700_000_000,
        now_ms=1_700_000_000_100,
    )

    assert result == {
        "status": "CANCELLED",
        "item_id": "i1",
        "next_item_id": "i2",
        "session_status": "LIVE",
    }
    transaction = client.transact_calls[0]["TransactItems"]
    assert len(transaction_keys(transaction)) == len(set(transaction_keys(transaction)))
    events_written = [
        decode_item(operation["Put"]["Item"])
        for operation in transaction
        if "Put" in operation
        and operation["Put"]["TableName"] == "events"
    ]
    assert [event["event_type"] for event in events_written] == [
        "ITEM_CANCELLED",
        "ITEM_OPENED",
    ]
    open_token = service._transaction_token("open", "s1", "i2", 4)
    assert events_written[1] == {
        "item_id": "i2",
        "sk": f"1700000000100#ITEM_OPENED#{open_token}",
        "event_type": "ITEM_OPENED",
        "session_id": "s1",
        "status": "LIVE",
        "timestamp": 1_700_000_000,
    }
    assert scheduler.create_calls[0]["Name"] == "close-item-i2-1700000060"


def test_cancel_non_active_waiting_item_does_not_progress_live_session(fake_config):
    target = catalog_item("i2", 2, "WAITING")
    client = FakeClient()
    catalog = FakeTable(
        "catalog",
        records=key_map(
            (item_lookup_key("i2"), lookup(target)),
            (item_key("s1", 2, "i2"), target),
            (
                session_key("s1"),
                session("LIVE", active_item_id="i1", current_sequence=1),
            ),
            (rules_key("s1"), rules()),
        ),
        query_responses=[
            {
                "Items": [
                    catalog_item("i1", 1, "LIVE"),
                    target,
                    catalog_item("i3", 3, "WAITING"),
                ]
            }
        ],
        client=client,
    )

    result = service._cancel_item(
        admin(),
        "i2",
        catalog,
        FakeTable("state", client=client),
        FakeTable("events", client=client),
        FakeScheduler(),
        fake_config,
        now=1_700_000_000,
        now_ms=1_700_000_000_100,
    )

    assert result == {"status": "CANCELLED", "item_id": "i2"}
    transaction = client.transact_calls[0]["TransactItems"]
    assert len(transaction) == 2
    assert [next(iter(operation)) for operation in transaction] == ["Update", "Put"]
    assert decode_item(transaction[0]["Update"]["Key"]) == item_key("s1", 2, "i2")
    assert decode_item(transaction[1]["Put"]["Item"])["event_type"] == (
        "ITEM_CANCELLED"
    )
    assert catalog.query_calls == []


def test_cancelled_retry_repairs_stale_close_schedule_deletion(fake_config):
    cancelled = catalog_item(status="CANCELLED", version=3)
    client = FakeClient()
    catalog = FakeTable(
        "catalog",
        records=key_map(
            (item_lookup_key("i1"), lookup(cancelled)),
            (item_key("s1", 1, "i1"), cancelled),
            (session_key("s1"), session("COMPLETED", version=6)),
        ),
        client=client,
    )
    state_table = FakeTable(
        "state",
        records=key_map(
            (
                {"item_id": "i1"},
                active_state(
                    status="CANCELLED",
                    version=4,
                    end_time=1_700_000_060,
                ),
            )
        ),
        client=client,
    )
    scheduler = FakeScheduler()
    events = FakeTable("events", client=client)

    result = service._cancel_item(
        admin(),
        "i1",
        catalog,
        state_table,
        events,
        scheduler,
        fake_config,
        now=1_700_000_100,
    )

    assert result == {"status": "ALREADY_CANCELLED", "item_id": "i1"}
    assert scheduler.delete_calls == [
        {"Name": "close-item-i1-1700000060", "GroupName": "la-lifecycle"}
    ]
    assert scheduler.create_calls == []
    assert client.transact_calls == []


def test_cancelled_retry_repairs_next_active_item_close_schedule(fake_config):
    cancelled = catalog_item(status="CANCELLED", version=3)
    next_item = catalog_item("i2", 2, "LIVE", version=3)
    catalog = FakeTable(
        "catalog",
        records=key_map(
            (item_lookup_key("i1"), lookup(cancelled)),
            (item_key("s1", 1, "i1"), cancelled),
            (item_lookup_key("i2"), lookup(next_item)),
            (item_key("s1", 2, "i2"), next_item),
            (
                session_key("s1"),
                session(
                    "LIVE",
                    version=6,
                    active_item_id="i2",
                    current_sequence=2,
                ),
            ),
        ),
    )
    state_table = FakeTable(
        "state",
        records=key_map(
            (
                {"item_id": "i1"},
                active_state(
                    status="CANCELLED",
                    version=4,
                    end_time=1_700_000_060,
                ),
            ),
            (
                {"item_id": "i2"},
                active_state(
                    item_id="i2",
                    status="LIVE",
                    version=1,
                    end_time=1_700_000_160,
                ),
            ),
        ),
    )
    scheduler = FakeScheduler()

    result = service._cancel_item(
        admin(),
        "i1",
        catalog,
        state_table,
        FakeTable("events"),
        scheduler,
        fake_config,
        now=1_700_000_100,
    )

    assert result == {"status": "ALREADY_CANCELLED", "item_id": "i1"}
    assert scheduler.delete_calls == [
        {"Name": "close-item-i1-1700000060", "GroupName": "la-lifecycle"}
    ]
    assert scheduler.create_calls[0]["Name"] == "close-item-i2-1700000160"
    assert all(call["ConsistentRead"] is True for call in catalog.get_calls)
    assert all(call["ConsistentRead"] is True for call in state_table.get_calls)


def test_cancelled_retry_accepts_integral_dynamodb_decimal_records(fake_config):
    cancelled = dynamo_round_trip(catalog_item(status="CANCELLED", version=3))
    successor = dynamo_round_trip(catalog_item("i2", 2, "LIVE", version=3))
    live_session = dynamo_round_trip(
        session(
            "LIVE",
            version=6,
            active_item_id="i2",
            current_sequence=2,
        )
    )
    catalog = FakeTable(
        "catalog",
        records=key_map(
            (item_lookup_key("i1"), dynamo_round_trip(lookup(cancelled))),
            (item_key("s1", 1, "i1"), cancelled),
            (item_lookup_key("i2"), dynamo_round_trip(lookup(successor))),
            (item_key("s1", 2, "i2"), successor),
            (session_key("s1"), live_session),
        ),
    )
    state_table = FakeTable(
        "state",
        records=key_map(
            (
                {"item_id": "i1"},
                dynamo_round_trip(
                    active_state(
                        status="CANCELLED",
                        version=4,
                        end_time=1_700_000_060,
                    )
                ),
            ),
            (
                {"item_id": "i2"},
                dynamo_round_trip(
                    active_state(
                        item_id="i2",
                        status="LIVE",
                        version=1,
                        end_time=1_700_000_160,
                    )
                ),
            ),
        ),
    )
    scheduler = FakeScheduler()

    result = service._cancel_item(
        admin(),
        "i1",
        catalog,
        state_table,
        FakeTable("events"),
        scheduler,
        fake_config,
        now=1_700_000_100,
    )

    assert result == {"status": "ALREADY_CANCELLED", "item_id": "i1"}
    assert scheduler.delete_calls[0]["Name"] == "close-item-i1-1700000060"
    assert scheduler.create_calls[0]["Name"] == "close-item-i2-1700000160"


def test_cancelled_retry_accepts_paused_successor_without_schedule(fake_config):
    cancelled = catalog_item(status="CANCELLED", version=3)
    successor = catalog_item("i2", 2, "PAUSED", version=4)
    catalog = FakeTable(
        "catalog",
        records=key_map(
            (item_lookup_key("i1"), lookup(cancelled)),
            (item_key("s1", 1, "i1"), cancelled),
            (item_lookup_key("i2"), lookup(successor)),
            (item_key("s1", 2, "i2"), successor),
            (
                session_key("s1"),
                session(
                    "LIVE",
                    version=7,
                    active_item_id="i2",
                    current_sequence=2,
                ),
            ),
        ),
    )
    state_table = FakeTable(
        "state",
        records=key_map(
            (
                {"item_id": "i1"},
                active_state(
                    status="CANCELLED",
                    version=4,
                    end_time=1_700_000_060,
                ),
            ),
            (
                {"item_id": "i2"},
                active_state(
                    item_id="i2",
                    status="PAUSED",
                    version=2,
                    end_time=1_700_000_160,
                    remaining_seconds=30,
                ),
            ),
        ),
    )
    scheduler = FakeScheduler()

    result = service._cancel_item(
        admin(),
        "i1",
        catalog,
        state_table,
        FakeTable("events"),
        scheduler,
        fake_config,
        now=1_700_000_100,
    )

    assert result == {"status": "ALREADY_CANCELLED", "item_id": "i1"}
    assert scheduler.delete_calls == [
        {"Name": "close-item-i1-1700000060", "GroupName": "la-lifecycle"}
    ]
    assert scheduler.create_calls == []


def test_operator_idempotent_results_do_not_duplicate_events(fake_config):
    cases = [
        (service._pause_item, "PAUSED", active_state(status="PAUSED", remaining_seconds=20)),
        (service._resume_item, "LIVE", active_state(status="LIVE", remaining_seconds=20)),
        (
            service._approve_item,
            "SOLD",
            active_state(
                status="SOLD",
                current_price=Decimal("120"),
                highest_bidder_id="winner-sub",
                final_price=Decimal("120"),
                winner_sub="winner-sub",
            ),
        ),
    ]
    for operation, status, state_value in cases:
        client, catalog, state_table, events = operation_tables(status, state_value)
        scheduler = FakeScheduler()
        args = [admin(), "i1", catalog, state_table, events]
        if operation is service._approve_item:
            args.extend([fake_config])
        else:
            args.extend([scheduler, fake_config])
        result = operation(*args, now=1_700_000_000)
        assert result["status"].startswith("ALREADY_")
        assert client.transact_calls == []


def test_watchdog_queries_live_gsi_limit_100_and_closes_only_overdue(
    monkeypatch, fake_config
):
    live_catalog = [catalog_item("overdue", 1, "LIVE"), catalog_item("future", 2, "LIVE")]
    catalog = FakeTable(
        "catalog",
        query_responses=[
            {
                "Items": live_catalog,
                "LastEvaluatedKey": {"pk": "more", "sk": "more"},
            }
        ],
    )
    state_table = FakeTable(
        "state",
        records=key_map(
            (
                {"item_id": "overdue"},
                active_state(item_id="overdue", end_time=999),
            ),
            (
                {"item_id": "future"},
                active_state(item_id="future", end_time=1200),
            ),
        ),
    )
    calls = []
    monkeypatch.setattr(
        service,
        "_close_item",
        lambda item_id, expected, *_args, **kwargs: calls.append(
            (item_id, expected, kwargs)
        )
        or {"status": "CLOSED"},
    )
    metrics = FakeMetrics()

    result = service._watchdog_sweep(
        catalog,
        state_table,
        FakeTable("events"),
        FakeScheduler(),
        fake_config,
        now=1000,
        metric_sink=metrics,
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
            },
            "Limit": 100,
        }
    ]
    assert all(call["ConsistentRead"] is True for call in state_table.get_calls)
    assert [call[:2] for call in calls] == [("overdue", 999)]
    assert calls[0][2]["force"] is False
    assert result == {"status": "SWEEP_COMPLETE", "closed": 1, "more_work": True}
    assert metrics.calls == [
        {"name": "WatchdogMoreWork", "unit": service.MetricUnit.Count, "value": 1}
    ]


def test_handler_flushes_watchdog_more_work_metric(monkeypatch, capsys):
    service.metrics.clear_metrics()

    def sweep():
        service.metrics.add_metric(
            name="WatchdogMoreWork",
            unit=service.MetricUnit.Count,
            value=1,
        )
        return {"status": "SWEEP_COMPLETE", "closed": 0, "more_work": True}

    monkeypatch.setattr(service, "watchdog_sweep", sweep)

    result = service.handler({"command": "WATCHDOG_SWEEP"}, None)
    emitted = json.loads(capsys.readouterr().out.strip())

    assert result["more_work"] is True
    assert emitted["WatchdogMoreWork"] == [1.0]
    assert emitted["_aws"]["CloudWatchMetrics"][0]["Namespace"] == "LiveAuction"


def test_metrics_wrapper_preserves_direct_scheduler_retry_error(monkeypatch):
    retry_error = client_error("ThrottlingException", "TransactWriteItems")
    service.metrics.clear_metrics()

    def fail(_session_id):
        raise retry_error

    monkeypatch.setattr(service, "start_session", fail)

    with pytest.raises(ClientError) as caught:
        service.handler(
            {"command": "START_SESSION", "session_id": "s1"},
            None,
        )

    assert caught.value is retry_error


def test_overdue_states_selects_only_overdue_live_items():
    states = [
        {"item_id": "overdue", "status": "LIVE", "end_time": 999},
        {"item_id": "future", "status": "LIVE", "end_time": 1200},
        {"item_id": "paused", "status": "PAUSED", "end_time": 900},
    ]
    assert service._overdue_states(states, now=1000) == [states[0]]


def test_rest_schedule_route_uses_trusted_authorizer_identity(monkeypatch, fake_config):
    calls = []
    monkeypatch.setattr(service, "_catalog_table", lambda: object())
    monkeypatch.setattr(service, "_scheduler_client", lambda: object())
    monkeypatch.setattr(service, "get_config", lambda: fake_config)
    monkeypatch.setattr(service.time, "time", lambda: 1_700_000_000)
    monkeypatch.setattr(
        service,
        "_schedule_session",
        lambda identity, session_id, start_time, *_args, **kwargs: calls.append(
            (identity, session_id, start_time, kwargs)
        )
        or {
            "session_id": session_id,
            "status": "SCHEDULED",
            "start_time": start_time,
        },
    )

    response = service.handler(
        rest_event(
            "POST",
            "/api/v1/auction-sessions/s1/schedule",
            {"start_time": 1_700_000_100, "seller_sub": "forged"},
        ),
        None,
    )

    assert response["statusCode"] == 200
    assert response_body(response)["code"] == "SESSION_SCHEDULED"
    assert calls[0][0] == seller()


def test_actual_handler_keeps_cors_headers_on_success_and_service_error(
    monkeypatch,
    fake_config,
):
    monkeypatch.setenv("CORS_ALLOWED_ORIGIN", "https://auction.example.com")
    monkeypatch.setattr(service, "_catalog_table", lambda: object())
    monkeypatch.setattr(service, "_scheduler_client", lambda: object())
    monkeypatch.setattr(service, "get_config", lambda: fake_config)
    monkeypatch.setattr(service.time, "time", lambda: 1_700_000_000)
    monkeypatch.setattr(
        service,
        "_schedule_session",
        lambda _identity, session_id, start_time, *_args, **_kwargs: {
            "session_id": session_id,
            "status": "SCHEDULED",
            "start_time": start_time,
        },
    )

    success = service.handler(
        rest_event(
            "POST",
            "/api/v1/auction-sessions/s1/schedule",
            {"start_time": 1_700_000_100},
        ),
        None,
    )
    service_error = service.handler(
        rest_event(
            "POST",
            "/api/v1/admin/items/i1/pause",
            {},
            groups="SELLER",
        ),
        None,
    )

    assert success["statusCode"] == 200
    assert service_error["statusCode"] == 403
    assert_cors_headers(success)
    assert_cors_headers(service_error)


@pytest.mark.parametrize("command", ["pause", "resume", "approve", "close", "cancel"])
def test_all_admin_routes_are_registered_and_enforce_admin(monkeypatch, command):
    response = service.handler(
        rest_event(
            "POST",
            f"/api/v1/admin/items/i1/{command}",
            {},
            groups="SELLER",
        ),
        None,
    )
    assert response["statusCode"] == 403
    assert response_body(response)["code"] == "FORBIDDEN"


@pytest.mark.parametrize(
    "event",
    [
        {"command": "START_SESSION"},
        {"command": "START_SESSION", "session_id": "s1", "extra": True},
        {"command": "CLOSE_ITEM", "item_id": "bad/item", "expected_end_epoch": 1},
        {
            "command": "CLOSE_ITEM",
            "item_id": "i1",
            "expected_end_epoch": 1,
            "extra": True,
        },
        {"command": "WATCHDOG_CLOSE", "item_id": "i1", "expected_end_epoch": True},
        {"command": "WATCHDOG_SWEEP", "extra": True},
        {"command": "UNKNOWN"},
    ],
)
def test_scheduler_dispatch_rejects_malformed_commands_without_identity(event):
    with pytest.raises(BadRequest):
        service.handler(event, None)


def test_scheduler_dispatches_all_direct_commands_without_authorizer(monkeypatch):
    calls = []
    monkeypatch.setattr(
        service,
        "start_session",
        lambda session_id: calls.append(("START_SESSION", session_id)) or {"ok": 1},
    )
    monkeypatch.setattr(
        service,
        "close_item",
        lambda item_id, expected: calls.append(("CLOSE_ITEM", item_id, expected))
        or {"ok": 2},
    )
    monkeypatch.setattr(
        service,
        "watchdog_sweep",
        lambda now=None: calls.append(("WATCHDOG_SWEEP", now)) or {"ok": 3},
    )

    assert service.handler({"command": "START_SESSION", "session_id": "s1"}, None) == {"ok": 1}
    assert service.handler(
        {"command": "CLOSE_ITEM", "item_id": "i1", "expected_end_epoch": 10}, None
    ) == {"ok": 2}
    assert service.handler(
        {"command": "WATCHDOG_CLOSE", "item_id": "i1", "expected_end_epoch": 11}, None
    ) == {"ok": 2}
    assert service.handler({"command": "WATCHDOG_SWEEP"}, None) == {"ok": 3}
    assert [call[0] for call in calls] == [
        "START_SESSION",
        "CLOSE_ITEM",
        "CLOSE_ITEM",
        "WATCHDOG_SWEEP",
    ]


def test_malformed_rest_body_and_path_return_stable_errors():
    malformed = service.handler(
        rest_event(
            "POST",
            "/api/v1/auction-sessions/s1/schedule",
            '{"start_time":',
        ),
        None,
    )
    invalid_path = service.handler(
        rest_event(
            "POST",
            "/api/v1/auction-sessions/bad%2Fid/schedule",
            {"start_time": 1_700_000_100},
        ),
        None,
    )

    assert response_body(malformed) == {
        "status": 400,
        "code": "INVALID_JSON",
        "message": "Request body must be valid JSON",
        "data": None,
    }
    assert invalid_path["statusCode"] in (400, 404)


def test_malformed_admin_path_fails_before_aws_client_construction():
    response = service.handler(
        rest_event(
            "POST",
            "/api/v1/admin/items/bad%2Fid/pause",
            {},
            groups="ADMIN",
        ),
        None,
    )

    assert response["statusCode"] == 400
    assert response_body(response)["code"] == "INVALID_ITEM_ID"


def test_unexpected_aws_failure_is_generic_rest_response(monkeypatch, fake_config):
    error = client_error(
        "ProvisionedThroughputExceededException",
        "UpdateItem",
        message="secret table details",
    )
    monkeypatch.setattr(service, "_catalog_table", lambda: object())
    monkeypatch.setattr(service, "_scheduler_client", lambda: object())
    monkeypatch.setattr(service, "get_config", lambda: fake_config)
    monkeypatch.setattr(
        service,
        "_schedule_session",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(error),
    )

    response = service.handler(
        rest_event(
            "POST",
            "/api/v1/auction-sessions/s1/schedule",
            {"start_time": 1_700_000_100},
        ),
        None,
    )

    assert response["statusCode"] == 500
    assert response_body(response)["code"] == "INTERNAL_ERROR"
    assert "secret table details" not in response["body"]


def test_admin_handler_has_no_cross_service_imports():
    handler = ROOT / "functions" / "admin_command" / "handler.py"
    tree = ast.parse(handler.read_text(encoding="utf-8"), filename=str(handler))
    violations = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and (node.module or "").startswith("functions."):
            violations.append(node.module)
        elif isinstance(node, ast.Import):
            violations.extend(
                alias.name for alias in node.names if alias.name.startswith("functions.")
            )
    assert violations == []


def test_admin_handler_imports_from_isolated_function_package(tmp_path):
    function_root = tmp_path / "function"
    layer_root = tmp_path / "layer" / "python"
    function_root.mkdir(parents=True)
    shutil.copy2(
        ROOT / "functions" / "admin_command" / "handler.py",
        function_root / "handler.py",
    )
    shutil.copytree(ROOT / "common" / "auction_common", layer_root / "auction_common")
    env = os.environ.copy()
    env["PYTHONPATH"] = os.pathsep.join((str(function_root), str(layer_root)))
    env["PYTHONNOUSERSITE"] = "1"

    result = subprocess.run(
        [sys.executable, "-c", "import handler; print(handler.app.__class__.__name__)"],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "APIGatewayRestResolver"
