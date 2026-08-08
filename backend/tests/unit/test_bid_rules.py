from decimal import Decimal

import pytest
from pydantic import ValidationError

from auction_common.errors import ACCEPTED, RejectReason
from auction_common.models import BidCommand, SessionRules
from functions.bid_processor.handler import (
    _apply_rules,
    _evaluate_anti_snipe,
    _rules_from_state,
)


STATE = {
    "current_price": Decimal("100"),
    "status": "LIVE",
    "owner_region": "ap-southeast-1",
    "end_time": 9999999999,
    "version": 1,
    "seller_sub": "seller-1",
    "extension_count": 0,
}


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


def test_rules_from_state_uses_item_snapshot_and_ignores_unrelated_fields():
    rules = _rules_from_state(
        {
            **STATE,
            "min_increment": Decimal("5"),
            "max_increment": Decimal("500"),
            "anti_snipe_window_s": 15,
            "anti_snipe_extend_s": 45,
            "max_extensions": 3,
            "unrelated": "ignored",
        }
    )

    assert rules == SessionRules(
        min_increment=Decimal("5"),
        max_increment=Decimal("500"),
        anti_snipe_window_s=15,
        anti_snipe_extend_s=45,
        max_extensions=3,
    )


def test_rules_from_empty_state_uses_defaults():
    assert _rules_from_state({}) == SessionRules()


def test_rules_from_state_rejects_invalid_values():
    with pytest.raises(ValidationError):
        _rules_from_state({"min_increment": "invalid"})


def test_apply_rules_uses_explicit_snapshot():
    rules = SessionRules(min_increment=Decimal("5"))

    result = _apply_rules(
        command(amount=Decimal("104")), STATE, now=1000, rules=rules
    )

    assert result.status == "REJECTED"
    assert result.reason == RejectReason.LOW_INCREMENT


def test_anti_snipe_uses_explicit_snapshot():
    rules = SessionRules(anti_snipe_window_s=15, anti_snipe_extend_s=45)

    end_time, extension_count = _evaluate_anti_snipe(
        {**STATE, "end_time": 1010}, now=1000, rules=rules
    )

    assert end_time == 1045
    assert extension_count == 1


def test_accepts_valid_bid_and_preserves_connection_id():
    result = _apply_rules(command(), STATE, now=1000)

    assert result.status == ACCEPTED
    assert result.reason is None
    assert result.current_price == Decimal("101")
    assert result.connection_id == "connection-1"


def test_rejects_bid_below_minimum_increment():
    result = _apply_rules(command(amount=Decimal("100.50")), STATE, now=1000)

    assert result.status == "REJECTED"
    assert result.reason == RejectReason.LOW_INCREMENT


def test_accepts_bid_at_minimum_increment_boundary():
    result = _apply_rules(command(amount=Decimal("101")), STATE, now=1000)

    assert result.status == ACCEPTED


def test_accepts_bid_at_maximum_increment_boundary():
    result = _apply_rules(command(amount=Decimal("1100")), STATE, now=1000)

    assert result.status == ACCEPTED


def test_rejects_bid_above_maximum_increment():
    result = _apply_rules(command(amount=Decimal("1100.01")), STATE, now=1000)

    assert result.status == "REJECTED"
    assert result.reason == RejectReason.HIGH_INCREMENT


def test_rejects_seller_bid():
    result = _apply_rules(command(user_sub="seller-1"), STATE, now=1000)

    assert result.status == "REJECTED"
    assert result.reason == RejectReason.SELLER_BID


def test_rejects_wrong_owner_region():
    result = _apply_rules(command(owner_region="ap-northeast-1"), STATE, now=1000)

    assert result.status == "REJECTED"
    assert result.reason == RejectReason.REGION


def test_rejects_non_live_item():
    result = _apply_rules(command(), {**STATE, "status": "WAITING"}, now=1000)

    assert result.status == "REJECTED"
    assert result.reason == RejectReason.NOT_LIVE


def test_anti_snipe_extends_end_time_until_extension_limit():
    end_time, extension_count = _evaluate_anti_snipe(
        {**STATE, "end_time": 1010}, now=1000
    )

    assert end_time == 1060
    assert extension_count == 1


def test_anti_snipe_does_not_extend_when_far_from_end():
    end_time, extension_count = _evaluate_anti_snipe(
        {**STATE, "end_time": 1300}, now=1000
    )

    assert end_time == 1300
    assert extension_count == 0


def test_anti_snipe_does_not_extend_after_max_extensions():
    end_time, extension_count = _evaluate_anti_snipe(
        {**STATE, "end_time": 1010, "extension_count": 10}, now=1000
    )

    assert end_time == 1010
    assert extension_count == 10
