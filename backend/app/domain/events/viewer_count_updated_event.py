from datetime import UTC, datetime
from uuid import UUID

from app.domain.events.auction_item_event import (
    AuctionItemEvent,
    AuctionItemEventType,
)


def create_viewer_count_updated_event(
    *,
    item_id: UUID,
    viewer_count: int,
) -> AuctionItemEvent:
    return AuctionItemEvent(
        type=AuctionItemEventType.VIEWER_COUNT_UPDATED,
        item_id=item_id,
        timestamp=datetime.now(UTC),
        data={"viewerCount": viewer_count},
    )
