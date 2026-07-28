from datetime import datetime, timedelta, timezone


VIETNAM_TIMEZONE = timezone(timedelta(hours=7))


def vietnam_now_naive() -> datetime:
    """Return the current Vietnam wall-clock time without tzinfo.

    MySQL DATETIME columns in this project are timezone-naive, so every
    auction timestamp is normalized to Vietnam time before persistence
    and comparison.
    """

    return datetime.now(VIETNAM_TIMEZONE).replace(tzinfo=None)


def to_vietnam_naive(value: datetime) -> datetime:
    """Normalize an aware or naive datetime to Vietnam wall-clock time."""

    if value.tzinfo is None:
        return value

    return value.astimezone(VIETNAM_TIMEZONE).replace(tzinfo=None)
