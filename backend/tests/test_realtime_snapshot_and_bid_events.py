import uuid
from datetime import UTC, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.application.dto.auction_item_realtime_snapshot import (
    AuctionItemRealtimeSnapshot,
)
from app.application.use_cases.realtime.join_auction_item import (
    JoinAuctionItemUseCase,
)
from app.application.use_cases.realtime.publish_bid_placed import (
    PublishBidPlacedUseCase,
)
from app.application.use_cases.realtime.send_auction_item_snapshot import (
    SendAuctionItemSnapshotUseCase,
)
from app.domain.events.auction_item_event import AuctionItemEventType
from app.infrastructure.realtime.in_memory_auction_connection_registry import (
    InMemoryAuctionConnectionRegistry,
)
from app.infrastructure.realtime.websocket_auction_event_publisher import (
    WebSocketAuctionEventPublisher,
)
from app.infrastructure.realtime.websocket_auction_realtime_event_sender import (
    WebSocketAuctionRealtimeEventSender,
)
from common.enum import AuctionItemStatus, AuctionSessionStatus
from modules.bids.bid_schema import PlaceBidRequest
from modules.bids.bid_service import BidService
from tests.fakes.auction_realtime_participant import build_test_participant
from tests.fakes.realtime_connection import FakeRealtimeConnection


def build_snapshot(item_id: uuid.UUID) -> AuctionItemRealtimeSnapshot:
    return AuctionItemRealtimeSnapshot(
        item_id=item_id,
        status="UNSOLD",
        current_price=Decimal("50000000.00"),
        starting_price=Decimal("50000000.00"),
        min_increment=Decimal("1000000.00"),
        opened_at=datetime(2026, 8, 4, 9, 0, tzinfo=UTC),
        closed_at=datetime(2026, 8, 4, 10, 0, tzinfo=UTC),
    )


@pytest.mark.asyncio
async def test_joining_sends_snapshot_only_to_new_connection() -> None:
    registry = InMemoryAuctionConnectionRegistry()
    publisher = WebSocketAuctionEventPublisher(registry)
    item_repository = AsyncMock()
    item_id = uuid.uuid4()
    item_repository.get_realtime_snapshot.return_value = build_snapshot(
        item_id,
    )
    db = AsyncMock()

    use_case = JoinAuctionItemUseCase(
        connection_registry=registry,
        event_publisher=publisher,
        item_repository=item_repository,
        send_snapshot_use_case=SendAuctionItemSnapshotUseCase(
            WebSocketAuctionRealtimeEventSender(),
        ),
        db=db,
    )

    existing = FakeRealtimeConnection()
    newcomer = FakeRealtimeConnection()

    await use_case.execute(
        item_id,
        existing,
        build_test_participant(item_id),
    )
    await use_case.execute(
        item_id,
        newcomer,
        build_test_participant(item_id),
    )

    assert existing.sent_messages[0]["type"] == (
        AuctionItemEventType.AUCTION_ITEM_SNAPSHOT
    )
    assert not any(
        message["type"] == AuctionItemEventType.AUCTION_ITEM_SNAPSHOT
        for message in existing.sent_messages[1:]
    )
    assert newcomer.sent_messages[0]["type"] == (
        AuctionItemEventType.AUCTION_ITEM_SNAPSHOT
    )


@pytest.mark.asyncio
async def test_failed_snapshot_send_removes_connection() -> None:
    registry = InMemoryAuctionConnectionRegistry()
    publisher = WebSocketAuctionEventPublisher(registry)
    item_repository = AsyncMock()
    item_id = uuid.uuid4()
    item_repository.get_realtime_snapshot.return_value = build_snapshot(
        item_id,
    )
    db = AsyncMock()

    use_case = JoinAuctionItemUseCase(
        connection_registry=registry,
        event_publisher=publisher,
        item_repository=item_repository,
        send_snapshot_use_case=SendAuctionItemSnapshotUseCase(
            WebSocketAuctionRealtimeEventSender(),
        ),
        db=db,
    )

    connection = FakeRealtimeConnection(fail_first_send=True)

    result = await use_case.execute(
        item_id,
        connection,
        build_test_participant(item_id),
    )

    assert result.accepted is False
    assert connection.closed is True
    assert await registry.get_viewer_count(item_id) == 0


@pytest.mark.asyncio
async def test_bid_placed_is_published_to_correct_item_room() -> None:
    registry = InMemoryAuctionConnectionRegistry()
    publisher = WebSocketAuctionEventPublisher(registry)
    item_id = uuid.uuid4()
    other_item_id = uuid.uuid4()

    target = FakeRealtimeConnection()
    other = FakeRealtimeConnection()

    await registry.connect(
        item_id,
        target,
        build_test_participant(item_id),
    )
    await registry.connect(
        other_item_id,
        other,
        build_test_participant(other_item_id),
    )

    use_case = PublishBidPlacedUseCase(publisher)
    bid_id = uuid.uuid4()
    placed_at = datetime(2026, 8, 4, 9, 15, tzinfo=UTC)

    await use_case.execute(
        item_id=item_id,
        bid_id=bid_id,
        amount=Decimal("52000000.00"),
        current_price=Decimal("52000000.00"),
        placed_at=placed_at,
    )

    assert target.sent_messages[-1]["type"] == AuctionItemEventType.BID_PLACED
    assert other.sent_messages == []


@pytest.mark.asyncio
async def test_publication_failure_does_not_undo_committed_bid() -> None:
    publish_use_case = AsyncMock()
    publish_use_case.execute.side_effect = ConnectionError("ws down")

    bid_repository = AsyncMock()
    item_repository = AsyncMock()
    session_repository = AsyncMock()
    notification_service = AsyncMock()

    service = BidService(
        bid_repository=bid_repository,
        item_repository=item_repository,
        session_repository=session_repository,
        notification_service=notification_service,
        publish_bid_placed_use_case=publish_use_case,
    )

    db = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.rollback = AsyncMock()

    item = MagicMock()
    item.id = uuid.uuid4()
    item.session_id = uuid.uuid4()
    item.title = "Test item"
    item.status = AuctionItemStatus.UNSOLD
    item.starting_price = Decimal("50000000.00")
    item.current_price = Decimal("50000000.00")
    item.session = MagicMock()
    item.session.status = AuctionSessionStatus.ACTIVE
    item.session.start_time = datetime(2020, 1, 1)
    item.session.end_time = datetime(2030, 1, 1)
    item.session.seller_id = uuid.uuid4()
    item.session.rules = MagicMock(min_increment=Decimal("1000000.00"))

    item_repository.find_by_id_for_update = AsyncMock(return_value=item)
    bid_repository.find_winning_by_item_id = AsyncMock(return_value=None)

    created_bid = MagicMock()
    created_bid.id = uuid.uuid4()
    created_bid.amount = Decimal("51000000.00")
    created_bid.created_at = datetime(2026, 8, 4, 9, 15, tzinfo=UTC)
    bid_repository.create = AsyncMock(return_value=created_bid)

    bidder = MagicMock()
    bidder.id = uuid.uuid4()

    result = await service.place_bid(
        db=db,
        item_id=item.id,
        bidder=bidder,
        request=PlaceBidRequest(amount=Decimal("51000000.00")),
    )

    assert result is created_bid
    db.commit.assert_awaited_once()
    db.rollback.assert_not_awaited()
    publish_use_case.execute.assert_awaited_once()
