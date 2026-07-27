import json
from decimal import Decimal

import pytest
from pydantic import ValidationError

from auction_common.errors import ACCEPTED, RejectReason
from auction_common.models import (
    BidCommand,
    BidResult,
    ControlPlaneRules,
    CreateItemRequest,
    CreateSessionRequest,
    PresignImageRequest,
    ScheduleSessionRequest,
    SessionRules,
)


def command(**overrides):
    values = {
        "item_id": "item-1",
        "amount": Decimal("101.00"),
        "request_id": "req-12345678",
        "user_sub": "bidder-1",
        "owner_region": "ap-southeast-1",
    }
    values.update(overrides)
    return BidCommand(**values)


def test_bid_command_accepts_decimal_and_optional_connection_id():
    bid = command(connection_id="connection-1")

    assert bid.amount == Decimal("101.00")
    assert bid.connection_id == "connection-1"


def test_bid_command_requires_request_id_of_at_least_eight_characters():
    with pytest.raises(ValidationError):
        command(request_id="short")


def test_bid_result_serializes_decimal_and_optional_fields():
    result = BidResult(
        item_id="item-1",
        request_id="req-12345678",
        status=ACCEPTED,
        current_price=Decimal("101.00"),
        end_time=1_700_000_000,
    )

    payload = json.loads(result.model_dump_json())

    assert payload["current_price"] == "101.00"
    assert payload["connection_id"] is None


def test_session_rules_have_stage_one_defaults():
    rules = SessionRules()

    assert rules.min_increment == Decimal("1")
    assert rules.max_increment == Decimal("1000")
    assert rules.anti_snipe_window_s == 30
    assert rules.anti_snipe_extend_s == 60
    assert rules.max_extensions == 10


def test_session_rules_preserve_legacy_unbounded_validation_behavior():
    rules = SessionRules(
        min_increment=Decimal("-1"),
        max_increment=Decimal("-2"),
        anti_snipe_window_s=-1,
        anti_snipe_extend_s=3601,
        max_extensions=101,
    )

    assert rules == SessionRules(
        min_increment=Decimal("-1"),
        max_increment=Decimal("-2"),
        anti_snipe_window_s=-1,
        anti_snipe_extend_s=3601,
        max_extensions=101,
    )


def test_session_rules_preserve_legacy_boolean_integer_coercion():
    rules = SessionRules(
        anti_snipe_window_s=True,
        anti_snipe_extend_s=False,
        max_extensions=True,
    )

    assert rules.anti_snipe_window_s == 1
    assert rules.anti_snipe_extend_s == 0
    assert rules.max_extensions == 1


@pytest.mark.parametrize(
    "overrides",
    [
        {"min_increment": Decimal("0")},
        {"max_increment": Decimal("0")},
        {"anti_snipe_window_s": -1},
        {"anti_snipe_extend_s": 3601},
        {"max_extensions": 101},
    ],
)
def test_control_plane_rules_reject_values_outside_practical_bounds(overrides):
    with pytest.raises(ValidationError):
        ControlPlaneRules(**overrides)


def test_control_plane_rules_have_bounded_history_default():
    rules = ControlPlaneRules()

    assert rules.public_history_limit == 20

    with pytest.raises(ValidationError):
        ControlPlaneRules(public_history_limit=101)


def test_control_plane_rules_reject_invalid_increment_range():
    with pytest.raises(ValidationError, match="max_increment must be"):
        ControlPlaneRules(
            min_increment=Decimal("10"),
            max_increment=Decimal("5"),
        )


@pytest.mark.parametrize(
    "overrides",
    [
        {"min_increment": Decimal("1.001")},
        {"max_increment": Decimal("1000.001")},
        {"min_increment": Decimal("1000000000.01")},
        {"max_increment": Decimal("1000000000.01")},
    ],
)
def test_control_plane_rules_reject_unsafe_monetary_values(overrides):
    with pytest.raises(ValidationError):
        ControlPlaneRules(**overrides)


@pytest.mark.parametrize(
    ("field_name", "overrides"),
    [
        ("public_history_limit", {"public_history_limit": True}),
        ("anti_snipe_window_s", {"anti_snipe_window_s": True}),
        ("anti_snipe_extend_s", {"anti_snipe_extend_s": True}),
        ("max_extensions", {"max_extensions": True}),
    ],
)
def test_control_plane_rules_reject_boolean_integer_fields(field_name, overrides):
    with pytest.raises(ValidationError) as exc_info:
        ControlPlaneRules(**overrides)

    assert exc_info.value.errors()[0]["loc"] == (field_name,)
    assert exc_info.value.errors()[0]["type"] == "int_type"


def test_create_session_ignores_untrusted_seller_and_bounds_text():
    request = CreateSessionRequest(title="Auction", seller_sub="forged-sub")

    assert request.description == ""
    assert "seller_sub" not in request.model_dump()

    with pytest.raises(ValidationError):
        CreateSessionRequest(title="")
    with pytest.raises(ValidationError):
        CreateSessionRequest(title="Auction", description="x" * 2001)


def test_create_session_strips_title():
    assert CreateSessionRequest(title="  Auction  ").title == "Auction"


def test_create_session_rejects_whitespace_only_title():
    with pytest.raises(ValidationError):
        CreateSessionRequest(title="   ")


def item_request(**overrides):
    values = {
        "name": "Lot one",
        "sequence_number": 1,
        "start_price": Decimal("0"),
        "duration_s": 30,
    }
    values.update(overrides)
    return CreateItemRequest(**values)


def test_create_item_accepts_boundary_values_and_optional_category():
    item = item_request(
        sequence_number=999999,
        duration_s=86400,
        category_id="collectibles",
    )

    assert item.description == ""
    assert item.start_price == Decimal("0")
    assert item.category_id == "collectibles"


def test_create_item_strips_name():
    assert item_request(name="  Lot one  ").name == "Lot one"


def test_create_item_rejects_whitespace_only_name():
    with pytest.raises(ValidationError):
        item_request(name="   ")


@pytest.mark.parametrize("duration_s", [29, 86401])
def test_create_item_rejects_duration_outside_bounds(duration_s):
    with pytest.raises(ValidationError):
        item_request(duration_s=duration_s)


def test_create_item_rejects_invalid_identity_price_and_text_values():
    for overrides in (
        {"name": ""},
        {"description": "x" * 2001},
        {"category_id": ""},
        {"sequence_number": 0},
        {"start_price": Decimal("-0.01")},
        {"start_price": Decimal("0.001")},
        {"start_price": Decimal("1000000000.01")},
    ):
        with pytest.raises(ValidationError):
            item_request(**overrides)


@pytest.mark.parametrize(
    ("field_name", "overrides"),
    [
        ("sequence_number", {"sequence_number": True}),
        ("duration_s", {"duration_s": True}),
    ],
)
def test_create_item_rejects_boolean_integer_fields(field_name, overrides):
    with pytest.raises(ValidationError) as exc_info:
        item_request(**overrides)

    assert exc_info.value.errors()[0]["loc"] == (field_name,)
    assert exc_info.value.errors()[0]["type"] == "int_type"


def test_stage3_monetary_fields_accept_dynamodb_upper_boundary():
    rules = ControlPlaneRules(
        min_increment=Decimal("1000000000.00"),
        max_increment=Decimal("1000000000.00"),
    )
    item = item_request(start_price=Decimal("1000000000.00"))

    assert rules.min_increment == Decimal("1000000000.00")
    assert rules.max_increment == Decimal("1000000000.00")
    assert item.start_price == Decimal("1000000000.00")


@pytest.mark.parametrize("content_type", ["application/pdf", "image/gif"])
def test_presign_image_rejects_unapproved_content_type(content_type):
    with pytest.raises(ValidationError):
        PresignImageRequest(content_type=content_type, size_bytes=1024)


@pytest.mark.parametrize("content_type", ["image/jpeg", "image/png", "image/webp"])
def test_presign_image_accepts_supported_types_at_maximum_size(content_type):
    request = PresignImageRequest(
        content_type=content_type,
        size_bytes=5 * 1024 * 1024,
    )

    assert request.content_type == content_type
    assert request.size_bytes == 5 * 1024 * 1024


@pytest.mark.parametrize("size_bytes", [0, 5 * 1024 * 1024 + 1])
def test_presign_image_rejects_size_outside_media_limit(size_bytes):
    with pytest.raises(ValidationError):
        PresignImageRequest(content_type="image/png", size_bytes=size_bytes)


def test_presign_image_rejects_boolean_size():
    with pytest.raises(ValidationError) as exc_info:
        PresignImageRequest(content_type="image/png", size_bytes=True)

    assert exc_info.value.errors()[0]["type"] == "int_type"


def test_schedule_session_requires_positive_start_time():
    assert ScheduleSessionRequest(start_time=1).start_time == 1

    with pytest.raises(ValidationError):
        ScheduleSessionRequest(start_time=0)


def test_schedule_session_rejects_boolean_start_time():
    with pytest.raises(ValidationError) as exc_info:
        ScheduleSessionRequest(start_time=True)

    assert exc_info.value.errors()[0]["type"] == "int_type"


@pytest.mark.parametrize(
    ("model_type", "payload"),
    [
        (
            ControlPlaneRules,
            '{"public_history_limit":20,"anti_snipe_window_s":30,'
            '"anti_snipe_extend_s":60,"max_extensions":10}',
        ),
        (
            CreateItemRequest,
            '{"name":"Lot one","sequence_number":1,"start_price":"0.00",'
            '"duration_s":30}',
        ),
        (
            PresignImageRequest,
            '{"content_type":"image/png","size_bytes":1024}',
        ),
        (ScheduleSessionRequest, '{"start_time":1700000000}'),
    ],
)
def test_stage3_strict_integer_fields_accept_json_integers(model_type, payload):
    assert model_type.model_validate_json(payload)


def test_reject_reason_tokens_are_stable():
    assert RejectReason.SELLER_BID == "REJECTED_SELLER_BID"
    assert RejectReason.LOW_INCREMENT == "REJECTED_LOW_INCREMENT"
