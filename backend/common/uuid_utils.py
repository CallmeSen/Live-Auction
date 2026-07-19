import uuid

from pydantic import BeforeValidator
from typing import Annotated


def parse_uuid(value: object) -> uuid.UUID:
    if isinstance(value, uuid.UUID):
        return value

    if not isinstance(value, str):
        raise ValueError("Value must be a valid UUID")

    cleaned = value.strip()

    if cleaned.startswith(("0x", "0X")):
        cleaned = cleaned[2:]

    cleaned = cleaned.replace("-", "")

    if len(cleaned) != 32:
        raise ValueError(
            "Value must be a valid UUID "
            "(e.g. 4381bbad-04ac-4088-b0b4-85fca226ef68d "
            "or MySQL hex 0x4381BBAD...)"
        )

    try:
        return uuid.UUID(hex=cleaned)
    except ValueError as exception:
        raise ValueError("Value must be a valid UUID") from exception


def parse_optional_uuid(value: object) -> uuid.UUID | None:
    if value is None:
        return None

    return parse_uuid(value)


FlexibleUUID = Annotated[uuid.UUID, BeforeValidator(parse_uuid)]
OptionalFlexibleUUID = Annotated[
    uuid.UUID | None,
    BeforeValidator(parse_optional_uuid),
]
