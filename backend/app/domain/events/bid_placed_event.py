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


def create_bid_placed_event(
    *,
    item_id: UUID,
    bid_id: UUID,
    amount: Decimal,
    current_price: Decimal,
    placed_at: datetime,
    bidder_id: UUID | None = None,
    bidder_name: str | None = None,
) -> AuctionItemEvent:
    data: dict[str, object] = {
        "bidId": str(bid_id),
        "amount": serialize_decimal(amount),
        "currentPrice": serialize_decimal(current_price),
        "placedAt": serialize_optional_datetime(placed_at),
    }

    if bidder_id is not None:
        data["bidderId"] = str(bidder_id)

    if bidder_name is not None:
        data["bidderName"] = bidder_name

    return AuctionItemEvent(
        type=AuctionItemEventType.BID_PLACED,
        item_id=item_id,
        timestamp=datetime.now(UTC),
        data=data,
    )
