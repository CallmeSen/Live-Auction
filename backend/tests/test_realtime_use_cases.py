import uuid
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from app.application.dto.auction_item_realtime_snapshot import (
    AuctionItemRealtimeSnapshot,
)
from app.application.use_cases.realtime.join_auction_item import (
    JoinAuctionItemUseCase,
)
from app.application.use_cases.realtime.leave_auction_item import (
    LeaveAuctionItemUseCase,
)
from app.application.use_cases.realtime.send_auction_item_snapshot import (
    SendAuctionItemSnapshotUseCase,
)
from app.infrastructure.realtime.in_memory_auction_connection_registry import (
    InMemoryAuctionConnectionRegistry,
)
from app.infrastructure.realtime.websocket_auction_event_publisher import (
    WebSocketAuctionEventPublisher,
)
from app.infrastructure.realtime.websocket_auction_realtime_event_sender import (
    WebSocketAuctionRealtimeEventSender,
)
from app.domain.events.auction_item_event import AuctionItemEventType
from tests.fakes.auction_realtime_participant import (
    build_guest_participant,
    build_test_participant,
)
from tests.fakes.realtime_connection import FakeRealtimeConnection


def build_snapshot(item_id: uuid.UUID) -> AuctionItemRealtimeSnapshot:
    return AuctionItemRealtimeSnapshot(
        item_id=item_id,
        status="UNSOLD",
        current_price=Decimal("50000000.00"),
        starting_price=Decimal("50000000.00"),
        min_increment=Decimal("1000000.00"),
        opened_at=None,
        closed_at=None,
    )


def build_join_use_case(
    registry: InMemoryAuctionConnectionRegistry,
    publisher: WebSocketAuctionEventPublisher,
    item_repository: AsyncMock,
    db: AsyncMock,
) -> JoinAuctionItemUseCase:
    return JoinAuctionItemUseCase(
        connection_registry=registry,
        event_publisher=publisher,
        item_repository=item_repository,
        send_snapshot_use_case=SendAuctionItemSnapshotUseCase(
            WebSocketAuctionRealtimeEventSender(),
        ),
        db=db,
    )


@pytest.mark.asyncio
async def test_invalid_item_closes_with_code_1008() -> None:
    registry = InMemoryAuctionConnectionRegistry()
    publisher = WebSocketAuctionEventPublisher(registry)
    item_repository = AsyncMock()
    item_repository.get_realtime_snapshot.return_value = None
    db = AsyncMock()

    use_case = build_join_use_case(registry, publisher, item_repository, db)

    connection = FakeRealtimeConnection()
    item_id = uuid.uuid4()

    result = await use_case.execute(
        item_id,
        connection,
        build_test_participant(item_id),
    )

    assert result.accepted is False
    assert connection.closed is True
    assert connection.close_code == 1008
    assert connection.accepted is False
    assert await registry.get_viewer_count(item_id) == 0


@pytest.mark.asyncio
async def test_join_publishes_viewer_count_to_all_connections() -> None:
    registry = InMemoryAuctionConnectionRegistry()
    publisher = WebSocketAuctionEventPublisher(registry)
    item_repository = AsyncMock()
    db = AsyncMock()

    item_id = uuid.uuid4()
    item_repository.get_realtime_snapshot.return_value = build_snapshot(
        item_id,
    )

    use_case = build_join_use_case(registry, publisher, item_repository, db)

    first = FakeRealtimeConnection()
    second = FakeRealtimeConnection()

    first_result = await use_case.execute(
        item_id,
        first,
        build_test_participant(item_id, display_name="User A"),
    )
    second_result = await use_case.execute(
        item_id,
        second,
        build_test_participant(item_id, display_name="User B"),
    )

    assert first_result.accepted is True
    assert second_result.accepted is True
    assert await registry.get_viewer_count(item_id) == 2
    assert first.sent_messages[1]["data"]["viewerCount"] == 1
    assert first.sent_messages[-1]["data"]["viewerCount"] == 2
    assert second.sent_messages[-1]["data"]["viewerCount"] == 2
    joined_messages = [
        message
        for message in first.sent_messages
        if message["type"] == AuctionItemEventType.VIEWER_JOINED
    ]
    assert len(joined_messages) == 1
    assert joined_messages[0]["data"]["displayName"] == "User B"


@pytest.mark.asyncio
async def test_leave_publishes_updated_viewer_count() -> None:
    registry = InMemoryAuctionConnectionRegistry()
    publisher = WebSocketAuctionEventPublisher(registry)
    item_id = uuid.uuid4()

    remaining = FakeRealtimeConnection()
    leaving = FakeRealtimeConnection()

    await registry.connect(
        item_id,
        remaining,
        build_test_participant(item_id, display_name="Remaining"),
    )
    await registry.connect(
        item_id,
        leaving,
        build_test_participant(item_id, display_name="Leaving"),
    )

    leave_use_case = LeaveAuctionItemUseCase(
        connection_registry=registry,
        event_publisher=publisher,
    )

    await leave_use_case.execute(item_id, leaving)

    assert await registry.get_viewer_count(item_id) == 1
    left_messages = [
        message
        for message in remaining.sent_messages
        if message["type"] == AuctionItemEventType.VIEWER_LEFT
    ]
    assert len(left_messages) == 1
    assert left_messages[0]["data"]["displayName"] == "Leaving"
    assert left_messages[0]["data"]["viewerCount"] == 1
    assert remaining.sent_messages[-1]["data"]["viewerCount"] == 1


@pytest.mark.asyncio
async def test_guest_participant_uses_safe_display_name() -> None:
    registry = InMemoryAuctionConnectionRegistry()
    publisher = WebSocketAuctionEventPublisher(registry)
    item_repository = AsyncMock()
    db = AsyncMock()
    item_id = uuid.uuid4()
    item_repository.get_realtime_snapshot.return_value = build_snapshot(item_id)

    use_case = build_join_use_case(registry, publisher, item_repository, db)

    first = FakeRealtimeConnection()
    second = FakeRealtimeConnection()

    await use_case.execute(
        item_id,
        first,
        build_test_participant(item_id, display_name="User A"),
    )
    await use_case.execute(
        item_id,
        second,
        build_guest_participant(item_id),
    )

    joined_messages = [
        message
        for message in first.sent_messages
        if message["type"] == AuctionItemEventType.VIEWER_JOINED
    ]

    assert joined_messages[-1]["data"]["displayName"] == "A guest"


@pytest.mark.asyncio
async def test_reconnect_with_same_session_does_not_publish_join() -> None:
    registry = InMemoryAuctionConnectionRegistry()
    publisher = WebSocketAuctionEventPublisher(registry)
    item_repository = AsyncMock()
    db = AsyncMock()
    item_id = uuid.uuid4()
    item_repository.get_realtime_snapshot.return_value = build_snapshot(item_id)

    use_case = build_join_use_case(registry, publisher, item_repository, db)

    observer = FakeRealtimeConnection()
    first = FakeRealtimeConnection()
    second = FakeRealtimeConnection()
    session_id = "tab-session-1"

    await use_case.execute(
        item_id,
        observer,
        build_test_participant(item_id, display_name="Observer"),
    )
    await use_case.execute(
        item_id,
        first,
        build_guest_participant(item_id, client_session_id=session_id),
    )

    joined_before = [
        message
        for message in observer.sent_messages
        if message["type"] == AuctionItemEventType.VIEWER_JOINED
    ]
    assert len(joined_before) == 1

    await use_case.execute(
        item_id,
        second,
        build_guest_participant(item_id, client_session_id=session_id),
    )

    joined_after = [
        message
        for message in observer.sent_messages
        if message["type"] == AuctionItemEventType.VIEWER_JOINED
    ]
    assert len(joined_after) == 1
    assert await registry.get_viewer_count(item_id) == 2
