from datetime import UTC, datetime
from uuid import UUID, uuid4

from app.domain.events.auction_item_event import (
    AuctionItemEvent,
    AuctionItemEventType,
)


def create_chat_message_sent_event(
    *,
    item_id: UUID,
    message_id: UUID | None = None,
    user_id: UUID,
    sender_name: str,
    content: str,
) -> AuctionItemEvent:
    return AuctionItemEvent(
        type=AuctionItemEventType.CHAT_MESSAGE_SENT,
        item_id=item_id,
        timestamp=datetime.now(UTC),
        data={
            "messageId": str(message_id or uuid4()),
            "userId": str(user_id),
            "senderName": sender_name,
            "content": content,
        },
    )
