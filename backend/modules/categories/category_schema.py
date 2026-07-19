import re
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from common.enum import CategoryStatus

SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class CreateCategoryRequest(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    slug: str | None = Field(default=None, max_length=150)

    model_config = ConfigDict(
        str_strip_whitespace=True,
    )

    @field_validator("name")
    @classmethod
    def validate_name(cls, name: str) -> str:
        if not name:
            raise ValueError("Name must not contain only spaces")

        return name

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, slug: str | None) -> str | None:
        if slug is None:
            return None

        if not SLUG_PATTERN.fullmatch(slug):
            raise ValueError(
                "Slug must contain only lowercase letters, numbers, and hyphens"
            )

        return slug


class CreateCategoryData(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    status: CategoryStatus
    created_at: datetime = Field(serialization_alias="createdAt")

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )


class CreateCategoryResponse(BaseModel):
    status: int
    code: int
    message: str
    data: CreateCategoryData
