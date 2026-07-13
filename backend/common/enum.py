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
    SCHEDULED = "SCHEDULED"
    ACTIVE = "ACTIVE"
    ENDED = "ENDED"
    CANCELLED = "CANCELLED"

class AuctionItemStatus(str, Enum):
    DRAFT = "DRAFT"
    READY = "READY"
    OPEN = "OPEN"
    SOLD = "SOLD"
    UNSOLD = "UNSOLD"
    CANCELLED = "CANCELLED"

class BidStatus(str, Enum):
    WINNING = "WINNING"
    OUTBID = "OUTBID"
    CANCELLED = "CANCELLED"