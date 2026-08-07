from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, model_validator


class BidCommand(BaseModel):
    item_id: str
    amount: Decimal
    request_id: str = Field(min_length=8)
    user_sub: str
    owner_region: str
    connection_id: str | None = None


class BidResult(BaseModel):
    item_id: str
    request_id: str
    status: str
    reason: str | None = None
    current_price: Decimal | None = None
    highest_bidder_alias: str | None = None
    end_time: int | None = None
    connection_id: str | None = None


class SessionRules(BaseModel):
    min_increment: Decimal = Decimal("1")
    max_increment: Decimal = Decimal("1000")
    anti_snipe_window_s: int = 30
    anti_snipe_extend_s: int = 60
    max_extensions: int = 10


class ControlPlaneRules(SessionRules):
    min_increment: Decimal = Field(
        default=Decimal("1"),
        gt=0,
        le=Decimal("1000000000"),
        max_digits=12,
        decimal_places=2,
    )
    max_increment: Decimal = Field(
        default=Decimal("1000"),
        gt=0,
        le=Decimal("1000000000"),
        max_digits=12,
        decimal_places=2,
    )
    anti_snipe_window_s: int = Field(default=30, strict=True, ge=0, le=3600)
    anti_snipe_extend_s: int = Field(default=60, strict=True, ge=0, le=3600)
    max_extensions: int = Field(default=10, strict=True, ge=0, le=100)
    public_history_limit: int = Field(default=20, strict=True, ge=0, le=100)

    @model_validator(mode="after")
    def increment_range_is_valid(self):
        if self.max_increment < self.min_increment:
            raise ValueError(
                "max_increment must be greater than or equal to min_increment"
            )
        return self


class CreateSessionRequest(BaseModel):
    title: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=200),
    ]
    description: str = Field(default="", max_length=2000)


class CreateItemRequest(BaseModel):
    name: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=200),
    ]
    description: str = Field(default="", max_length=2000)
    category_id: str | None = Field(default=None, min_length=1, max_length=100)
    sequence_number: int = Field(strict=True, ge=1, le=999999)
    start_price: Decimal = Field(
        ge=0,
        le=Decimal("1000000000"),
        max_digits=12,
        decimal_places=2,
    )
    duration_s: int = Field(strict=True, ge=30, le=86400)


class PresignImageRequest(BaseModel):
    content_type: Literal["image/jpeg", "image/png", "image/webp"]
    size_bytes: int = Field(strict=True, ge=1, le=5 * 1024 * 1024)


class ScheduleSessionRequest(BaseModel):
    start_time: int = Field(strict=True, gt=0)


class AdminUserStatusRequest(BaseModel):
    status: Literal["ACTIVE", "BANNED"]


class AdminAccountCreateRequest(BaseModel):
    email: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=3, max_length=254),
    ]
    full_name: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=200),
    ]
    phone: str | None = Field(default=None, max_length=32)


class AdminCategoryCreateRequest(BaseModel):
    name: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=150),
    ]
    slug: str | None = Field(default=None, max_length=150)


class AdminCategoryUpdateRequest(BaseModel):
    name: Annotated[
        str | None,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=150),
    ] = None
    slug: str | None = Field(default=None, max_length=150)
    status: Literal["ACTIVE", "INACTIVE"] | None = None

    @model_validator(mode="after")
    def has_change(self):
        if self.name is None and self.slug is None and self.status is None:
            raise ValueError("At least one category field is required")
        return self
