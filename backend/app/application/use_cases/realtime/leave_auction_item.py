import logging
from uuid import UUID

from app.application.ports.auction_connection_registry import (
    AuctionConnectionRegistry,
)
from app.application.ports.auction_event_publisher import AuctionEventPublisher
from app.application.ports.realtime_connection import RealtimeConnection
from app.domain.events.auction_item_event_serialization import (
    serialize_auction_item_event,
)
from app.domain.events.viewer_count_updated_event import (
    create_viewer_count_updated_event,
)
from app.domain.events.viewer_left_event import create_viewer_left_event

logger = logging.getLogger(__name__)


class LeaveAuctionItemUseCase:
    def __init__(
        self,
        connection_registry: AuctionConnectionRegistry,
        event_publisher: AuctionEventPublisher,
    ) -> None:
        self._connection_registry = connection_registry
        self._event_publisher = event_publisher

    async def execute(
        self,
        item_id: UUID,
        connection: RealtimeConnection,
    ) -> None:
        disconnect_result = await self._connection_registry.disconnect(
            item_id,
            connection,
        )

        if disconnect_result is None or not disconnect_result.should_publish_leave:
            return

        participant = disconnect_result.participant
        viewer_count = await self._connection_registry.get_viewer_count(item_id)

        logger.info(
            "WebSocket disconnected item_id=%s viewer_count=%s",
            item_id,
            viewer_count,
        )

        left_event = create_viewer_left_event(
            item_id=item_id,
            connection_id=participant.connection_id,
            user_id=participant.user_id,
            display_name=participant.display_name,
            viewer_count=viewer_count,
        )

        await self._connection_registry.broadcast(
            item_id,
            serialize_auction_item_event(left_event),
        )

        viewer_count_event = create_viewer_count_updated_event(
            item_id=item_id,
            viewer_count=viewer_count,
        )

        await self._event_publisher.publish(item_id, viewer_count_event)
