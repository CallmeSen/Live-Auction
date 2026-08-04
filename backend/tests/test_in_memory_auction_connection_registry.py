import uuid

import pytest

from app.domain.events.viewer_count_updated_event import (
    create_viewer_count_updated_event,
)
from app.infrastructure.realtime.in_memory_auction_connection_registry import (
    InMemoryAuctionConnectionRegistry,
)
from app.infrastructure.realtime.websocket_auction_event_publisher import (
    WebSocketAuctionEventPublisher,
)
from tests.fakes.auction_realtime_participant import build_test_participant
from tests.fakes.realtime_connection import FakeRealtimeConnection


@pytest.fixture
def registry() -> InMemoryAuctionConnectionRegistry:
    return InMemoryAuctionConnectionRegistry()


@pytest.fixture
def item_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.fixture
def other_item_id() -> uuid.UUID:
    return uuid.uuid4()


@pytest.mark.asyncio
async def test_connecting_one_client_returns_viewer_count_one(
    registry: InMemoryAuctionConnectionRegistry,
    item_id: uuid.UUID,
) -> None:
    connection = FakeRealtimeConnection()

    await registry.connect(
        item_id,
        connection,
        build_test_participant(item_id),
    )

    assert await registry.get_viewer_count(item_id) == 1


@pytest.mark.asyncio
async def test_connecting_two_clients_returns_viewer_count_two(
    registry: InMemoryAuctionConnectionRegistry,
    item_id: uuid.UUID,
) -> None:
    first = FakeRealtimeConnection()
    second = FakeRealtimeConnection()

    await registry.connect(
        item_id,
        first,
        build_test_participant(item_id),
    )
    await registry.connect(
        item_id,
        second,
        build_test_participant(item_id),
    )

    assert await registry.get_viewer_count(item_id) == 2


@pytest.mark.asyncio
async def test_disconnecting_one_client_returns_viewer_count_one(
    registry: InMemoryAuctionConnectionRegistry,
    item_id: uuid.UUID,
) -> None:
    first = FakeRealtimeConnection()
    second = FakeRealtimeConnection()

    await registry.connect(
        item_id,
        first,
        build_test_participant(item_id),
    )
    await registry.connect(
        item_id,
        second,
        build_test_participant(item_id),
    )
    await registry.disconnect(item_id, first)

    assert await registry.get_viewer_count(item_id) == 1


@pytest.mark.asyncio
async def test_connections_from_different_item_ids_are_isolated(
    registry: InMemoryAuctionConnectionRegistry,
    item_id: uuid.UUID,
    other_item_id: uuid.UUID,
) -> None:
    first_room = FakeRealtimeConnection()
    second_room = FakeRealtimeConnection()

    await registry.connect(
        item_id,
        first_room,
        build_test_participant(item_id),
    )
    await registry.connect(
        other_item_id,
        second_room,
        build_test_participant(other_item_id),
    )

    assert await registry.get_viewer_count(item_id) == 1
    assert await registry.get_viewer_count(other_item_id) == 1


@pytest.mark.asyncio
async def test_broadcast_sends_only_to_clients_in_correct_room(
    registry: InMemoryAuctionConnectionRegistry,
    item_id: uuid.UUID,
    other_item_id: uuid.UUID,
) -> None:
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

    event = create_viewer_count_updated_event(
        item_id=item_id,
        viewer_count=2,
    )
    publisher = WebSocketAuctionEventPublisher(registry)

    await publisher.publish(
        item_id,
        event,
    )

    assert len(target.sent_messages) == 1
    assert target.sent_messages[0]["data"]["viewerCount"] == 2
    assert other.sent_messages == []


@pytest.mark.asyncio
async def test_dead_connections_are_removed_on_broadcast(
    registry: InMemoryAuctionConnectionRegistry,
    item_id: uuid.UUID,
) -> None:
    healthy = FakeRealtimeConnection()
    dead = FakeRealtimeConnection(send_raises=True)

    await registry.connect(
        item_id,
        healthy,
        build_test_participant(item_id),
    )
    await registry.connect(
        item_id,
        dead,
        build_test_participant(item_id),
    )

    await registry.broadcast(item_id, {"type": "TEST"})

    assert await registry.get_viewer_count(item_id) == 1


@pytest.mark.asyncio
async def test_disconnect_is_safe_when_connection_already_removed(
    registry: InMemoryAuctionConnectionRegistry,
    item_id: uuid.UUID,
) -> None:
    connection = FakeRealtimeConnection()

    await registry.connect(
        item_id,
        connection,
        build_test_participant(item_id),
    )
    await registry.disconnect(item_id, connection)
    await registry.disconnect(item_id, connection)

    assert await registry.get_viewer_count(item_id) == 0


def test_registry_singleton_is_shared_across_dependency_imports() -> None:
    from app.dependencies import realtime_dependencies as first
    from app.dependencies import realtime_dependencies as second

    assert first.get_auction_connection_registry() is second.get_auction_connection_registry()
