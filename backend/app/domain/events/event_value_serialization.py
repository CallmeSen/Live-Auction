from datetime import UTC, datetime
from decimal import Decimal


def serialize_decimal(value: Decimal) -> str:
    return format(value, "f")


def serialize_optional_datetime(value: datetime | None) -> str | None:
    if value is None:
        return None

    if value.tzinfo is None:
        normalized = value.replace(tzinfo=UTC)
    else:
        normalized = value.astimezone(UTC)

    return normalized.isoformat().replace("+00:00", "Z")
