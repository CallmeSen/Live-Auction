from dataclasses import dataclass
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.application.ports.auction_event_publisher import AuctionEventPublisher
from app.domain.events.chat_message_sent_event import create_chat_message_sent_event
from app.models.user_model import User
from modules.auction_items.item_repository import AuctionItemRepository

MAX_CHAT_MESSAGE_LENGTH = 500


@dataclass(frozen=True)
class SendAuctionChatMessageResult:
    ok: bool
    error_code: str | None = None
    error_message: str | None = None


class SendAuctionChatMessageUseCase:
    def __init__(
        self,
        event_publisher: AuctionEventPublisher,
        item_repository: AuctionItemRepository,
        db: AsyncSession,
    ) -> None:
        self._event_publisher = event_publisher
        self._item_repository = item_repository
        self._db = db

    async def execute(
        self,
        *,
        item_id: UUID,
        user: User | None,
        content: str,
    ) -> SendAuctionChatMessageResult:
        if user is None:
            return SendAuctionChatMessageResult(
                ok=False,
                error_code="UNAUTHORIZED",
                error_message="Authentication is required to send chat messages.",
            )

        item_exists = await self._item_repository.exists(
            db=self._db,
            item_id=item_id,
        )

        if not item_exists:
            return SendAuctionChatMessageResult(
                ok=False,
                error_code="ITEM_NOT_FOUND",
                error_message="Auction item was not found.",
            )

        trimmed_content = content.strip()

        if not trimmed_content:
            return SendAuctionChatMessageResult(
                ok=False,
                error_code="INVALID_CHAT_MESSAGE",
                error_message="Chat message cannot be empty.",
            )

        if len(trimmed_content) > MAX_CHAT_MESSAGE_LENGTH:
            return SendAuctionChatMessageResult(
                ok=False,
                error_code="MESSAGE_TOO_LONG",
                error_message=(
                    f"Chat message cannot exceed {MAX_CHAT_MESSAGE_LENGTH} characters."
                ),
            )

        event = create_chat_message_sent_event(
            item_id=item_id,
            user_id=user.id,
            sender_name=user.full_name,
            content=trimmed_content,
        )

        await self._event_publisher.publish(item_id, event)

        return SendAuctionChatMessageResult(ok=True)
