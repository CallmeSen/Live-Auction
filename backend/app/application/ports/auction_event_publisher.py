from abc import ABC, abstractmethod
from uuid import UUID

from app.domain.events.auction_item_event import AuctionItemEvent


class AuctionEventPublisher(ABC):
    @abstractmethod
    async def publish(
        self,
        item_id: UUID,
        event: AuctionItemEvent,
    ) -> None:
        ...
