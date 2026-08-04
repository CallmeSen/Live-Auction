import logging
from uuid import UUID

from app.application.ports.auction_event_publisher import AuctionEventPublisher
from app.domain.events.auction_item_event import AuctionItemEvent

logger = logging.getLogger(__name__)


class PublishAuctionItemTimelineEventUseCase:
    def __init__(
        self,
        event_publisher: AuctionEventPublisher,
    ) -> None:
        self._event_publisher = event_publisher

    async def execute(
        self,
        *,
        item_id: UUID,
        event: AuctionItemEvent,
    ) -> None:
        try:
            await self._event_publisher.publish(item_id, event)
        except Exception:
            logger.exception(
                "Failed to publish timeline event type=%s item_id=%s",
                event.type,
                item_id,
            )
            raise
