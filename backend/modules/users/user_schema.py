import uuid
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

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
