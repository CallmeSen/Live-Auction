from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field


class AuctionItemEventType(str, Enum):
    VIEWER_COUNT_UPDATED = "VIEWER_COUNT_UPDATED"
    VIEWER_JOINED = "VIEWER_JOINED"
    VIEWER_LEFT = "VIEWER_LEFT"
    AUCTION_ITEM_SNAPSHOT = "AUCTION_ITEM_SNAPSHOT"
    BID_PLACED = "BID_PLACED"
    CHAT_MESSAGE_SENT = "CHAT_MESSAGE_SENT"
    AUCTION_STARTED = "AUCTION_STARTED"
    AUCTION_ENDED = "AUCTION_ENDED"
    AUCTION_CANCELLED = "AUCTION_CANCELLED"
    ITEM_SOLD = "ITEM_SOLD"
    ITEM_UNSOLD = "ITEM_UNSOLD"


class AuctionItemEvent(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    type: AuctionItemEventType
    event_id: UUID = Field(default_factory=uuid4, alias="eventId")
    item_id: UUID = Field(alias="itemId")
    timestamp: datetime
    data: dict[str, Any]
