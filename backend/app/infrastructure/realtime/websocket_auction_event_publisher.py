from uuid import UUID

from app.application.ports.auction_connection_registry import (
    AuctionConnectionRegistry,
)
from app.application.ports.auction_event_publisher import AuctionEventPublisher
from app.domain.events.auction_item_event import AuctionItemEvent
from app.domain.events.auction_item_event_serialization import (
    serialize_auction_item_event,
)


class WebSocketAuctionEventPublisher(AuctionEventPublisher):
    def __init__(
        self,
        connection_registry: AuctionConnectionRegistry,
    ) -> None:
        self._connection_registry = connection_registry

    async def publish(
        self,
        item_id: UUID,
        event: AuctionItemEvent,
    ) -> None:
        payload = serialize_auction_item_event(event)

        await self._connection_registry.broadcast(item_id, payload)
