import logging

from app.application.dto.auction_item_realtime_snapshot import (
    AuctionItemRealtimeSnapshot,
)
from app.application.ports.auction_realtime_event_sender import (
    AuctionRealtimeEventSender,
)
from app.application.ports.realtime_connection import RealtimeConnection
from app.domain.events.auction_item_snapshot_event import (
    create_auction_item_snapshot_event,
)

logger = logging.getLogger(__name__)


class SendAuctionItemSnapshotUseCase:
    def __init__(
        self,
        event_sender: AuctionRealtimeEventSender,
    ) -> None:
        self._event_sender = event_sender

    async def execute(
        self,
        *,
        snapshot: AuctionItemRealtimeSnapshot,
        connection: RealtimeConnection,
    ) -> bool:
        event = create_auction_item_snapshot_event(
            item_id=snapshot.item_id,
            status=snapshot.status,
            current_price=snapshot.current_price,
            starting_price=snapshot.starting_price,
            min_increment=snapshot.min_increment,
            opened_at=snapshot.opened_at,
            closed_at=snapshot.closed_at,
        )

        try:
            await self._event_sender.send_to_connection(connection, event)
        except Exception:
            logger.exception(
                "Failed to send AUCTION_ITEM_SNAPSHOT item_id=%s",
                snapshot.item_id,
            )
            return False

        return True
