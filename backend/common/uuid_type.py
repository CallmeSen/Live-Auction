import uuid

from sqlalchemy.dialects.mysql import BINARY
from sqlalchemy.types import TypeDecorator


class BinaryUUID(TypeDecorator):
    """
    Store a Python UUID as MySQL BINARY(16).

    Python:
        UUID("550e8400-e29b-41d4-a716-446655440000")

    Database:
        16 raw bytes
    """

    impl = BINARY(16)
    cache_ok = True

    def process_bind_param(
        self,
        value: uuid.UUID | str | None,
        dialect,
    ) -> bytes | None:
        if value is None:
            return None

        if isinstance(value, str):
            value = uuid.UUID(value)

        if not isinstance(value, uuid.UUID):
            raise ValueError("Value must be a UUID, UUID string, or None")

        return value.bytes

    def process_result_value(
        self,
        value: bytes | None,
        dialect,
    ) -> uuid.UUID | None:
        if value is None:
            return None

        return uuid.UUID(bytes=value)