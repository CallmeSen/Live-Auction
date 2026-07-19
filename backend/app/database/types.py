import uuid

from sqlalchemy import CHAR
from sqlalchemy.types import TypeDecorator


class UUIDString(TypeDecorator[uuid.UUID]):
    impl = CHAR(36)
    cache_ok = True

    def process_bind_param(
        self,
        value: uuid.UUID | str | None,
        dialect,
    ) -> str | None:
        if value is None:
            return None
        if isinstance(value, uuid.UUID):
            return str(value)
        return str(uuid.UUID(value))

    def process_result_value(
        self,
        value: str | None,
        dialect,
    ) -> uuid.UUID | None:
        if value is None:
            return None
        return uuid.UUID(value)
