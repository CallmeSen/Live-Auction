import logging
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from app.application.ports.auction_event_publisher import AuctionEventPublisher
from app.domain.events.bid_placed_event import create_bid_placed_event

logger = logging.getLogger(__name__)


class PublishBidPlacedUseCase:
    def __init__(
        self,
        event_publisher: AuctionEventPublisher,
    ) -> None:
        self._event_publisher = event_publisher

    async def execute(
        self,
        *,
        item_id: UUID,
        bid_id: UUID,
        amount: Decimal,
        current_price: Decimal,
        placed_at: datetime,
        bidder_id: UUID | None = None,
        bidder_name: str | None = None,
    ) -> None:
        event = create_bid_placed_event(
            item_id=item_id,
            bid_id=bid_id,
            amount=amount,
            current_price=current_price,
            placed_at=placed_at,
            bidder_id=bidder_id,
            bidder_name=bidder_name,
        )

        try:
            await self._event_publisher.publish(item_id, event)
        except Exception:
            logger.exception(
                "Failed to publish BID_PLACED item_id=%s bid_id=%s current_price=%s",
                item_id,
                bid_id,
                current_price,
            )
            raise
