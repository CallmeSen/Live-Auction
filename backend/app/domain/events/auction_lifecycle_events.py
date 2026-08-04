from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from app.domain.events.auction_item_event import (
    AuctionItemEvent,
    AuctionItemEventType,
)
from app.domain.events.event_value_serialization import serialize_decimal


def create_auction_started_event(
    *,
    item_id: UUID,
    message: str = "The auction has started.",
    event_id: UUID | None = None,
) -> AuctionItemEvent:
    return AuctionItemEvent(
        type=AuctionItemEventType.AUCTION_STARTED,
        event_id=event_id or uuid4(),
        item_id=item_id,
        timestamp=datetime.now(UTC),
        data={"message": message},
    )


def create_auction_ended_event(
    *,
    item_id: UUID,
    message: str = "The auction has ended.",
    event_id: UUID | None = None,
) -> AuctionItemEvent:
    return AuctionItemEvent(
        type=AuctionItemEventType.AUCTION_ENDED,
        event_id=event_id or uuid4(),
        item_id=item_id,
        timestamp=datetime.now(UTC),
        data={"message": message},
    )


def create_auction_cancelled_event(
    *,
    item_id: UUID,
    message: str = "The auction was cancelled.",
    event_id: UUID | None = None,
) -> AuctionItemEvent:
    return AuctionItemEvent(
        type=AuctionItemEventType.AUCTION_CANCELLED,
        event_id=event_id or uuid4(),
        item_id=item_id,
        timestamp=datetime.now(UTC),
        data={"message": message},
    )


def create_item_sold_event(
    *,
    item_id: UUID,
    winner_user_id: UUID,
    winner_name: str,
    final_price: Decimal,
    event_id: UUID | None = None,
) -> AuctionItemEvent:
    return AuctionItemEvent(
        type=AuctionItemEventType.ITEM_SOLD,
        event_id=event_id or uuid4(),
        item_id=item_id,
        timestamp=datetime.now(UTC),
        data={
            "winnerUserId": str(winner_user_id),
            "winnerName": winner_name,
            "finalPrice": serialize_decimal(final_price),
        },
    )


def create_item_unsold_event(
    *,
    item_id: UUID,
    message: str = "The item did not sell.",
    event_id: UUID | None = None,
) -> AuctionItemEvent:
    return AuctionItemEvent(
        type=AuctionItemEventType.ITEM_UNSOLD,
        event_id=event_id or uuid4(),
        item_id=item_id,
        timestamp=datetime.now(UTC),
        data={"message": message},
    )
