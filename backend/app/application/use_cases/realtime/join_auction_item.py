import logging
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.application.dto.auction_realtime_participant import (
    AuctionRealtimeParticipant,
)
from app.application.ports.auction_connection_registry import (
    AuctionConnectionRegistry,
)
from app.application.ports.auction_event_publisher import AuctionEventPublisher
from app.application.ports.realtime_connection import RealtimeConnection
from app.application.use_cases.realtime.send_auction_item_snapshot import (
    SendAuctionItemSnapshotUseCase,
)
from app.domain.events.auction_item_event_serialization import (
    serialize_auction_item_event,
)
from app.domain.events.viewer_count_updated_event import (
    create_viewer_count_updated_event,
)
from app.domain.events.viewer_joined_event import create_viewer_joined_event
from modules.auction_items.item_repository import AuctionItemRepository

logger = logging.getLogger(__name__)

POLICY_VIOLATION_CLOSE_CODE = 1008


@dataclass(frozen=True)
class JoinAuctionItemResult:
    accepted: bool


class JoinAuctionItemUseCase:
    def __init__(
        self,
        connection_registry: AuctionConnectionRegistry,
        event_publisher: AuctionEventPublisher,
        item_repository: AuctionItemRepository,
        send_snapshot_use_case: SendAuctionItemSnapshotUseCase,
        db: AsyncSession,
    ) -> None:
        self._connection_registry = connection_registry
        self._event_publisher = event_publisher
        self._item_repository = item_repository
        self._send_snapshot_use_case = send_snapshot_use_case
        self._db = db

    async def execute(
        self,
        item_id: UUID,
        connection: RealtimeConnection,
        participant: AuctionRealtimeParticipant,
    ) -> JoinAuctionItemResult:
        snapshot = await self._item_repository.get_realtime_snapshot(
            db=self._db,
            item_id=item_id,
        )

        if snapshot is None:
            logger.info(
                "Rejected WebSocket connection for invalid auction item item_id=%s",
                item_id,
            )
            await connection.close(code=POLICY_VIOLATION_CLOSE_CODE)
            return JoinAuctionItemResult(accepted=False)

        connect_result = await self._connection_registry.connect(
            item_id,
            connection,
            participant,
        )

        snapshot_sent = await self._send_snapshot_use_case.execute(
            snapshot=snapshot,
            connection=connection,
        )

        if not snapshot_sent:
            await self._connection_registry.disconnect(item_id, connection)
            await connection.close(code=POLICY_VIOLATION_CLOSE_CODE)
            return JoinAuctionItemResult(accepted=False)

        viewer_count = await self._connection_registry.get_viewer_count(item_id)

        logger.info(
            "WebSocket connected item_id=%s viewer_count=%s reconnect=%s",
            item_id,
            viewer_count,
            connect_result.is_reconnect,
        )

        if not connect_result.is_reconnect:
            viewer_count_event = create_viewer_count_updated_event(
                item_id=item_id,
                viewer_count=viewer_count,
            )
            await self._event_publisher.publish(item_id, viewer_count_event)

            if viewer_count > 1:
                joined_event = create_viewer_joined_event(
                    item_id=item_id,
                    connection_id=participant.connection_id,
                    user_id=participant.user_id,
                    display_name=participant.display_name,
                    viewer_count=viewer_count,
                )
                await self._connection_registry.broadcast_except(
                    item_id,
                    serialize_auction_item_event(joined_event),
                    exclude=connection,
                )

        return JoinAuctionItemResult(accepted=True)
