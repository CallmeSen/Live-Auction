import re
import uuid
from datetime import datetime
from enum import Enum
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from common.enum import UserRole, UserStatus


class UserSortBy(str, Enum):
    CREATED_AT = "createdAt"
    EMAIL = "email"
    FULL_NAME = "fullName"


class SortOrder(str, Enum):
    ASC = "asc"
    DESC = "desc"


class AdminUserListItem(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str = Field(serialization_alias="fullName")
    phone: str
    role: UserRole
    status: UserStatus
    created_at: datetime = Field(serialization_alias="createdAt")
    updated_at: datetime = Field(serialization_alias="updatedAt")

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )


class AdminUserListPagination(BaseModel):
    page: int
    page_size: int = Field(serialization_alias="pageSize")
    total_items: int = Field(serialization_alias="totalItems")
    total_pages: int = Field(serialization_alias="totalPages")
    has_next_page: bool = Field(serialization_alias="hasNextPage")
    has_previous_page: bool = Field(serialization_alias="hasPreviousPage")

    model_config = ConfigDict(
        populate_by_name=True,
    )


class AdminUserListData(BaseModel):
    items: list[AdminUserListItem]
    pagination: AdminUserListPagination

    model_config = ConfigDict(
        populate_by_name=True,
    )


class ListAdminUsersResponse(BaseModel):
    status: int
    code: int
    message: str
    data: AdminUserListData


class UpdateUserStatusRequest(BaseModel):
    status: UserStatus

    model_config = ConfigDict(
        populate_by_name=True,
    )


class UpdateUserStatusData(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str = Field(serialization_alias="fullName")
    phone: str
    role: UserRole
    status: UserStatus
    updated_at: datetime = Field(serialization_alias="updatedAt")

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )


class UpdateUserStatusResponse(BaseModel):
    status: int
    code: str
    message: str
    data: UpdateUserStatusData


class UserProfileData(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str = Field(serialization_alias="fullName")
    phone: str
    role: UserRole
    status: UserStatus
    created_at: datetime = Field(serialization_alias="createdAt")
    updated_at: datetime = Field(serialization_alias="updatedAt")

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )


class GetProfileResponse(BaseModel):
    status: int
    code: str
    message: str
    data: UserProfileData


class UpdateProfileRequest(BaseModel):
    full_name: str | None = Field(
        default=None,
        alias="fullName",
        min_length=2,
        max_length=255,
    )
    phone: str | None = Field(default=None, max_length=30)

    model_config = ConfigDict(
        populate_by_name=True,
        str_strip_whitespace=True,
    )

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, full_name: str | None) -> str | None:
        if full_name is not None and not full_name:
            raise ValueError("Full name must not be blank")

        return full_name

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, phone: str | None) -> str | None:
        if phone is None:
            return None

        if not phone:
            raise ValueError("Phone must not be blank")

        normalized_phone = re.sub(r"[\s-]", "", phone)

        if not re.fullmatch(r"\+?\d{9,15}", normalized_phone):
            raise ValueError(
                "Phone must contain 9 to 15 digits and may start with +"
            )

        return normalized_phone

    @model_validator(mode="after")
    def validate_at_least_one_field(self) -> Self:
        if self.full_name is None and self.phone is None:
            raise ValueError("At least one field must be provided to update")

        return self


class UpdateProfileData(UserProfileData):
    pass


class UpdateProfileResponse(BaseModel):
    status: int
    code: str
    message: str
    data: UpdateProfileData
class NotificationPreferenceData(BaseModel):
    notify_when_outbid: bool = Field(alias="notifyWhenOutbid")
    remind_before_auction_ends: bool = Field(alias="remindBeforeAuctionEnds")
    receive_featured_auction_news: bool = Field(alias="receiveFeaturedAuctionNews")

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )


class GetNotificationPreferenceResponse(BaseModel):
    status: int
    code: str
    message: str
    data: NotificationPreferenceData


class UpdateNotificationPreferenceRequest(BaseModel):
    notify_when_outbid: bool = Field(alias="notifyWhenOutbid")
    remind_before_auction_ends: bool = Field(alias="remindBeforeAuctionEnds")
    receive_featured_auction_news: bool = Field(alias="receiveFeaturedAuctionNews")

    model_config = ConfigDict(
        populate_by_name=True,
    )


class UpdateNotificationPreferenceResponse(BaseModel):
    status: int
    code: str
    message: str
    data: NotificationPreferenceData