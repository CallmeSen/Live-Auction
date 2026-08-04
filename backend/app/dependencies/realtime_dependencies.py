from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.use_cases.realtime.join_auction_item import (
    JoinAuctionItemUseCase,
)
from app.application.use_cases.realtime.leave_auction_item import (
    LeaveAuctionItemUseCase,
)
from app.application.use_cases.realtime.publish_bid_placed import (
    PublishBidPlacedUseCase,
)
from app.application.use_cases.realtime.publish_auction_item_timeline_event import (
    PublishAuctionItemTimelineEventUseCase,
)
from app.application.use_cases.realtime.send_auction_chat_message import (
    SendAuctionChatMessageUseCase,
)
from app.application.use_cases.realtime.send_auction_item_snapshot import (
    SendAuctionItemSnapshotUseCase,
)
from app.core.database import get_db
from app.infrastructure.realtime.in_memory_auction_connection_registry import (
    InMemoryAuctionConnectionRegistry,
)
from app.infrastructure.realtime.websocket_auction_event_publisher import (
    WebSocketAuctionEventPublisher,
)
from app.infrastructure.realtime.websocket_auction_realtime_event_sender import (
    WebSocketAuctionRealtimeEventSender,
)
from modules.auction_items.item_repository import AuctionItemRepository

# Single-process in-memory realtime stack. Use exactly one Uvicorn worker:
#   uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
# Multiple workers require Redis or another shared presence system.
_auction_connection_registry = InMemoryAuctionConnectionRegistry()
_auction_event_publisher = WebSocketAuctionEventPublisher(
    _auction_connection_registry,
)
_auction_realtime_event_sender = WebSocketAuctionRealtimeEventSender()
_send_auction_item_snapshot_use_case = SendAuctionItemSnapshotUseCase(
    _auction_realtime_event_sender,
)
_publish_bid_placed_use_case = PublishBidPlacedUseCase(
    _auction_event_publisher,
)
_publish_auction_item_timeline_event_use_case = (
    PublishAuctionItemTimelineEventUseCase(
        _auction_event_publisher,
    )
)


def get_auction_connection_registry() -> InMemoryAuctionConnectionRegistry:
    return _auction_connection_registry


def get_publish_bid_placed_use_case() -> PublishBidPlacedUseCase:
    return _publish_bid_placed_use_case


def get_publish_auction_item_timeline_event_use_case() -> (
    PublishAuctionItemTimelineEventUseCase
):
    return _publish_auction_item_timeline_event_use_case


def get_leave_auction_item_use_case() -> LeaveAuctionItemUseCase:
    return LeaveAuctionItemUseCase(
        connection_registry=_auction_connection_registry,
        event_publisher=_auction_event_publisher,
    )


async def get_join_auction_item_use_case(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> JoinAuctionItemUseCase:
    return JoinAuctionItemUseCase(
        connection_registry=_auction_connection_registry,
        event_publisher=_auction_event_publisher,
        item_repository=AuctionItemRepository(),
        send_snapshot_use_case=_send_auction_item_snapshot_use_case,
        db=db,
    )


async def get_send_auction_chat_message_use_case(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SendAuctionChatMessageUseCase:
    return SendAuctionChatMessageUseCase(
        event_publisher=_auction_event_publisher,
        item_repository=AuctionItemRepository(),
        db=db,
    )
