from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from app.domain.events.auction_item_event import (
    AuctionItemEvent,
    AuctionItemEventType,
)
from app.domain.events.event_value_serialization import (
    serialize_decimal,
    serialize_optional_datetime,
)


def create_auction_item_snapshot_event(
    *,
    item_id: UUID,
    status: str,
    current_price: Decimal,
    starting_price: Decimal,
    min_increment: Decimal,
    opened_at: datetime | None,
    closed_at: datetime | None,
) -> AuctionItemEvent:
    return AuctionItemEvent(
        type=AuctionItemEventType.AUCTION_ITEM_SNAPSHOT,
        item_id=item_id,
        timestamp=datetime.now(UTC),
        data={
            "status": status,
            "currentPrice": serialize_decimal(current_price),
            "startingPrice": serialize_decimal(starting_price),
            "minIncrement": serialize_decimal(min_increment),
            "openedAt": serialize_optional_datetime(opened_at),
            "closedAt": serialize_optional_datetime(closed_at),
        },
    )
