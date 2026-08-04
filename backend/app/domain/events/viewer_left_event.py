from datetime import UTC, datetime
from uuid import UUID, uuid4

from app.domain.events.auction_item_event import (
    AuctionItemEvent,
    AuctionItemEventType,
)


def create_viewer_left_event(
    *,
    item_id: UUID,
    connection_id: UUID,
    user_id: UUID | None,
    display_name: str,
    viewer_count: int,
    event_id: UUID | None = None,
) -> AuctionItemEvent:
    data: dict[str, object] = {
        "connectionId": str(connection_id),
        "displayName": display_name,
        "viewerCount": viewer_count,
    }

    if user_id is not None:
        data["userId"] = str(user_id)

    return AuctionItemEvent(
        type=AuctionItemEventType.VIEWER_LEFT,
        event_id=event_id or uuid4(),
        item_id=item_id,
        timestamp=datetime.now(UTC),
        data=data,
    )
