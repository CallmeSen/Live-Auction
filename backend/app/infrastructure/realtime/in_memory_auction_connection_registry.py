import asyncio
import logging
from collections import defaultdict
from uuid import UUID

from app.application.dto.auction_realtime_participant import (
    AuctionRealtimeParticipant,
    ConnectParticipantResult,
    DisconnectParticipantResult,
)
from app.application.ports.auction_connection_registry import (
    AuctionConnectionRegistry,
)
from app.application.ports.realtime_connection import RealtimeConnection

logger = logging.getLogger(__name__)


class InMemoryAuctionConnectionRegistry(AuctionConnectionRegistry):
    """
    In-memory viewer presence registry.

    Requires a single Uvicorn worker / single process. Multiple workers need
    Redis or another shared presence store so all instances see the same rooms.
    """

    def __init__(self) -> None:
        self._rooms: dict[UUID, set[RealtimeConnection]] = defaultdict(set)
        self._participants: dict[int, AuctionRealtimeParticipant] = {}
        self._session_index: dict[tuple[UUID, str], RealtimeConnection] = {}
        self._lock = asyncio.Lock()

    def _connection_key(self, connection: RealtimeConnection) -> int:
        return id(connection)

    async def connect(
        self,
        item_id: UUID,
        connection: RealtimeConnection,
        participant: AuctionRealtimeParticipant,
    ) -> ConnectParticipantResult:
        await connection.accept()

        is_reconnect = False

        async with self._lock:
            if participant.client_session_id:
                session_key = (item_id, participant.client_session_id)
                existing_connection = self._session_index.get(session_key)

                if existing_connection is not None and existing_connection is not connection:
                    self._remove_connection_locked(item_id, existing_connection)
                    is_reconnect = True

            self._rooms[item_id].add(connection)
            self._participants[self._connection_key(connection)] = participant

            if participant.client_session_id:
                self._session_index[(item_id, participant.client_session_id)] = (
                    connection
                )

        return ConnectParticipantResult(is_reconnect=is_reconnect)

    async def disconnect(
        self,
        item_id: UUID,
        connection: RealtimeConnection,
    ) -> DisconnectParticipantResult | None:
        async with self._lock:
            participant = self._remove_connection_locked(item_id, connection)

        if participant is None:
            return None

        return DisconnectParticipantResult(
            participant=participant,
            should_publish_leave=True,
        )

    def _remove_connection_locked(
        self,
        item_id: UUID,
        connection: RealtimeConnection,
    ) -> AuctionRealtimeParticipant | None:
        room = self._rooms.get(item_id)

        if room is None or connection not in room:
            return None

        room.discard(connection)

        if not room:
            del self._rooms[item_id]

        participant = self._participants.pop(self._connection_key(connection), None)

        if participant is None:
            return None

        if participant.client_session_id:
            session_key = (item_id, participant.client_session_id)

            if self._session_index.get(session_key) is connection:
                del self._session_index[session_key]

        return participant

    async def get_viewer_count(
        self,
        item_id: UUID,
    ) -> int:
        async with self._lock:
            room = self._rooms.get(item_id)

            if room is None:
                return 0

            return len(room)

    async def broadcast(
        self,
        item_id: UUID,
        message: dict,
    ) -> None:
        async with self._lock:
            room = self._rooms.get(item_id)

            if not room:
                return

            connections = set(room)

        await self._send_to_connections(item_id, connections, message)

    async def broadcast_except(
        self,
        item_id: UUID,
        message: dict,
        exclude: RealtimeConnection,
    ) -> None:
        async with self._lock:
            room = self._rooms.get(item_id)

            if not room:
                return

            connections = {connection for connection in room if connection is not exclude}

        await self._send_to_connections(item_id, connections, message)

    async def _send_to_connections(
        self,
        item_id: UUID,
        connections: set[RealtimeConnection],
        message: dict,
    ) -> None:
        failed_connections: list[RealtimeConnection] = []

        for connection in connections:
            try:
                await connection.send_json(message)
            except Exception:
                logger.warning(
                    "Unexpected WebSocket send failure item_id=%s",
                    item_id,
                    exc_info=True,
                )
                failed_connections.append(connection)

        if not failed_connections:
            return

        async with self._lock:
            room = self._rooms.get(item_id)

            if room is None:
                return

            for connection in failed_connections:
                self._remove_connection_locked(item_id, connection)
