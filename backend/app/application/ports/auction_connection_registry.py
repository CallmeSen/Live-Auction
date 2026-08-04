from abc import ABC, abstractmethod
from uuid import UUID

from app.application.dto.auction_realtime_participant import (
    AuctionRealtimeParticipant,
    ConnectParticipantResult,
    DisconnectParticipantResult,
)
from app.application.ports.realtime_connection import RealtimeConnection


class AuctionConnectionRegistry(ABC):
    @abstractmethod
    async def connect(
        self,
        item_id: UUID,
        connection: RealtimeConnection,
        participant: AuctionRealtimeParticipant,
    ) -> ConnectParticipantResult:
        ...

    @abstractmethod
    async def disconnect(
        self,
        item_id: UUID,
        connection: RealtimeConnection,
    ) -> DisconnectParticipantResult | None:
        ...

    @abstractmethod
    async def get_viewer_count(
        self,
        item_id: UUID,
    ) -> int:
        ...

    @abstractmethod
    async def broadcast(
        self,
        item_id: UUID,
        message: dict,
    ) -> None:
        ...

    @abstractmethod
    async def broadcast_except(
        self,
        item_id: UUID,
        message: dict,
        exclude: RealtimeConnection,
    ) -> None:
        ...
