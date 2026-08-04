import uuid
from unittest.mock import AsyncMock

import pytest

from app.application.use_cases.realtime.send_auction_chat_message import (
    SendAuctionChatMessageUseCase,
)
from app.domain.events.auction_item_event import AuctionItemEventType
from app.infrastructure.realtime.in_memory_auction_connection_registry import (
    InMemoryAuctionConnectionRegistry,
)
from app.infrastructure.realtime.websocket_auction_event_publisher import (
    WebSocketAuctionEventPublisher,
)
from app.models.user_model import User
from tests.fakes.auction_realtime_participant import build_test_participant
from tests.fakes.realtime_connection import FakeRealtimeConnection


def build_user() -> User:
    user = User()
    user.id = uuid.uuid4()
    user.full_name = "Nguyen Van A"
    user.email = "a@example.com"
    user.password_hash = "hash"
    return user


@pytest.mark.asyncio
async def test_send_chat_message_broadcasts_to_room() -> None:
    registry = InMemoryAuctionConnectionRegistry()
    publisher = WebSocketAuctionEventPublisher(registry)
    item_repository = AsyncMock()
    db = AsyncMock()

    item_id = uuid.uuid4()
    item_repository.exists.return_value = True

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

    use_case = SendAuctionChatMessageUseCase(
        event_publisher=publisher,
        item_repository=item_repository,
        db=db,
    )

    result = await use_case.execute(
        item_id=item_id,
        user=build_user(),
        content="  Hello  ",
    )

    assert result.ok is True
    assert first.sent_messages[-1]["type"] == AuctionItemEventType.CHAT_MESSAGE_SENT
    assert second.sent_messages[-1]["type"] == AuctionItemEventType.CHAT_MESSAGE_SENT
    assert first.sent_messages[-1]["data"]["content"] == "Hello"
    assert second.sent_messages[-1]["data"]["content"] == "Hello"


@pytest.mark.asyncio
async def test_send_chat_message_rejects_empty_content() -> None:
    publisher = AsyncMock()
    item_repository = AsyncMock()
    db = AsyncMock()

    use_case = SendAuctionChatMessageUseCase(
        event_publisher=publisher,
        item_repository=AsyncMock(),
        db=db,
    )

    result = await use_case.execute(
        item_id=uuid.uuid4(),
        user=build_user(),
        content="   ",
    )

    assert result.ok is False
    assert result.error_code == "INVALID_CHAT_MESSAGE"
    publisher.publish.assert_not_called()


@pytest.mark.asyncio
async def test_send_chat_message_rejects_unauthenticated_user() -> None:
    publisher = AsyncMock()
    db = AsyncMock()

    use_case = SendAuctionChatMessageUseCase(
        event_publisher=publisher,
        item_repository=AsyncMock(),
        db=db,
    )

    result = await use_case.execute(
        item_id=uuid.uuid4(),
        user=None,
        content="Hello",
    )

    assert result.ok is False
    assert result.error_code == "UNAUTHORIZED"
    publisher.publish.assert_not_called()


@pytest.mark.asyncio
async def test_send_chat_message_rejects_missing_item() -> None:
    publisher = AsyncMock()
    item_repository = AsyncMock()
    db = AsyncMock()
    item_repository.exists.return_value = False

    use_case = SendAuctionChatMessageUseCase(
        event_publisher=publisher,
        item_repository=item_repository,
        db=db,
    )

    result = await use_case.execute(
        item_id=uuid.uuid4(),
        user=build_user(),
        content="Hello",
    )

    assert result.ok is False
    assert result.error_code == "ITEM_NOT_FOUND"
    publisher.publish.assert_not_called()


@pytest.mark.asyncio
async def test_send_chat_message_rejects_long_content() -> None:
    publisher = AsyncMock()
    item_repository = AsyncMock()
    db = AsyncMock()
    item_repository.exists.return_value = True

    use_case = SendAuctionChatMessageUseCase(
        event_publisher=publisher,
        item_repository=item_repository,
        db=db,
    )

    result = await use_case.execute(
        item_id=uuid.uuid4(),
        user=build_user(),
        content="a" * 501,
    )

    assert result.ok is False
    assert result.error_code == "MESSAGE_TOO_LONG"
    publisher.publish.assert_not_called()
