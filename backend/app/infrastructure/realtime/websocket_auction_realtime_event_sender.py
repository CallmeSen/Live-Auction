from app.application.ports.auction_realtime_event_sender import (
    AuctionRealtimeEventSender,
)
from app.application.ports.realtime_connection import RealtimeConnection
from app.domain.events.auction_item_event import AuctionItemEvent
from app.domain.events.auction_item_event_serialization import (
    serialize_auction_item_event,
)


class WebSocketAuctionRealtimeEventSender(AuctionRealtimeEventSender):
    async def send_to_connection(
        self,
        connection: RealtimeConnection,
        event: AuctionItemEvent,
    ) -> None:
        payload = serialize_auction_item_event(event)

        await connection.send_json(payload)
