import re
import uuid
from datetime import datetime
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

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


class UpdateCategoryRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    slug: str | None = Field(default=None, max_length=150)
    status: CategoryStatus | None = None

    model_config = ConfigDict(
        str_strip_whitespace=True,
    )

    @field_validator("name")
    @classmethod
    def validate_name(cls, name: str | None) -> str | None:
        if name is not None and not name:
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

    @model_validator(mode="after")
    def validate_at_least_one_field(self) -> Self:
        if self.name is None and self.slug is None and self.status is None:
            raise ValueError("At least one field must be provided to update")

        return self


class CategoryBaseData(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    status: CategoryStatus
    created_at: datetime = Field(serialization_alias="createdAt")

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )


class CreateCategoryData(CategoryBaseData):
    pass


class CreateCategoryResponse(BaseModel):
    status: int
    code: int
    message: str
    data: CreateCategoryData


class CategoryDetailData(CategoryBaseData):
    pass


class GetCategoryDetailResponse(BaseModel):
    status: int
    code: int
    message: str
    data: CategoryDetailData


class CategoryListItem(CategoryBaseData):
    pass


class CategoryListData(BaseModel):
    items: list[CategoryListItem]
    page: int
    size: int
    total: int


class ListCategoriesResponse(BaseModel):
    status: int
    code: int
    message: str
    data: CategoryListData


class UpdateCategoryData(CategoryBaseData):
    pass


class UpdateCategoryResponse(BaseModel):
    status: int
    code: int
    message: str
    data: UpdateCategoryData


class DeleteCategoryResponse(BaseModel):
    status: int
    code: int
    message: str
    data: None = None