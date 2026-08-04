from enum import Enum


class UserRole(str, Enum):
    ADMIN = "ADMIN"
    USER = "USER"


class UserStatus(str, Enum):
    ACTIVE = "ACTIVE"
    BANNED = "BANNED"


class CategoryStatus(str, Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"


class AuctionSessionStatus(str, Enum):
    """Lifecycle of an auction session (the whole event)."""

    SCHEDULED = "SCHEDULED"
    ACTIVE = "ACTIVE"
    ENDED = "ENDED"
    CANCELLED = "CANCELLED"


class AuctionItemStatus(str, Enum):
    """
    Lifecycle of a product inside an auction session.

    UNSOLD: item belongs to the session and may receive bids while the
            session is ACTIVE.
    SOLD:   item has a winning bidder and is no longer in the active
            auction.
    CANCELLED: item was removed from the session (for example when the
               session is cancelled).
    """

    SOLD = "SOLD"
    UNSOLD = "UNSOLD"
    CANCELLED = "CANCELLED"


class BidStatus(str, Enum):
    WINNING = "WINNING"
    OUTBID = "OUTBID"


class MyBidOutcome(str, Enum):
    LEADING = "LEADING"
    OUTBID = "OUTBID"
    WON = "WON"
    LOST = "LOST"


class NotificationType(str, Enum):
    BID = "BID"
    AUCTION = "AUCTION"
    SYSTEM = "SYSTEM"
