import uuid
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal


@dataclass(frozen=True)
class AuctionItemRealtimeSnapshot:
    item_id: uuid.UUID
    status: str
    current_price: Decimal
    starting_price: Decimal
    min_increment: Decimal
    opened_at: datetime | None
    closed_at: datetime | None
