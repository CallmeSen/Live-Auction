from abc import ABC, abstractmethod

from app.application.ports.realtime_connection import RealtimeConnection
from app.domain.events.auction_item_event import AuctionItemEvent


class AuctionRealtimeEventSender(ABC):
    @abstractmethod
    async def send_to_connection(
        self,
        connection: RealtimeConnection,
        event: AuctionItemEvent,
    ) -> None:
        ...
