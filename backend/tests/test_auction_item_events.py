import uuid
from datetime import UTC, datetime
from decimal import Decimal

from app.domain.events.auction_item_event import AuctionItemEventType
from app.domain.events.auction_item_snapshot_event import (
    create_auction_item_snapshot_event,
)
from app.domain.events.bid_placed_event import create_bid_placed_event
from app.domain.events.auction_item_event_serialization import (
    serialize_auction_item_event,
)


def test_snapshot_event_uses_item_id_alias() -> None:
    item_id = uuid.uuid4()

    event = create_auction_item_snapshot_event(
        item_id=item_id,
        status="OPEN",
        current_price=Decimal("51000000.00"),
        starting_price=Decimal("50000000.00"),
        min_increment=Decimal("1000000.00"),
        opened_at=datetime(2026, 8, 4, 9, 0, tzinfo=UTC),
        closed_at=datetime(2026, 8, 4, 10, 0, tzinfo=UTC),
    )

    payload = serialize_auction_item_event(event)

    assert payload["type"] == AuctionItemEventType.AUCTION_ITEM_SNAPSHOT
    assert payload["itemId"] == str(item_id)
    assert payload["data"]["currentPrice"] == "51000000.00"
    assert payload["data"]["startingPrice"] == "50000000.00"
    assert payload["data"]["minIncrement"] == "1000000.00"


def test_snapshot_event_preserves_decimal_precision() -> None:
    event = create_auction_item_snapshot_event(
        item_id=uuid.uuid4(),
        status="OPEN",
        current_price=Decimal("51000000.50"),
        starting_price=Decimal("50000000.00"),
        min_increment=Decimal("1000000.00"),
        opened_at=None,
        closed_at=None,
    )

    payload = serialize_auction_item_event(event)

    assert payload["data"]["currentPrice"] == "51000000.50"


def test_bid_placed_event_contains_required_fields() -> None:
    item_id = uuid.uuid4()
    bid_id = uuid.uuid4()
    placed_at = datetime(2026, 8, 4, 9, 15, tzinfo=UTC)

    event = create_bid_placed_event(
        item_id=item_id,
        bid_id=bid_id,
        amount=Decimal("52000000.00"),
        current_price=Decimal("52000000.00"),
        placed_at=placed_at,
    )

    payload = serialize_auction_item_event(event)

    assert payload["type"] == AuctionItemEventType.BID_PLACED
    assert payload["itemId"] == str(item_id)
    assert payload["data"]["bidId"] == str(bid_id)
    assert payload["data"]["amount"] == "52000000.00"
    assert payload["data"]["currentPrice"] == "52000000.00"
    assert payload["data"]["placedAt"] == "2026-08-04T09:15:00Z"
