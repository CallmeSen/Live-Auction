from enum import StrEnum


class RejectReason(StrEnum):
    NOT_LIVE = "REJECTED_NOT_LIVE"
    SELLER_BID = "REJECTED_SELLER_BID"
    LOW_INCREMENT = "REJECTED_LOW_INCREMENT"
    HIGH_INCREMENT = "REJECTED_HIGH_INCREMENT"
    DUPLICATE = "REJECTED_DUPLICATE"
    REGION = "REJECTED_REGION"


ACCEPTED = "ACCEPTED"


class AuthError(Exception):
    pass


class ItemStateNotFound(Exception):
    pass
