import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from common.enum import NotificationType


class NotificationItem(BaseModel):
    id: uuid.UUID
    type: NotificationType
    title: str
    message: str
    created_at: datetime = Field(serialization_alias="createdAt")
    action_url: str | None = Field(serialization_alias="actionUrl")
    is_read: bool = Field(serialization_alias="isRead")

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )


class NotificationListData(BaseModel):
    items: list[NotificationItem]
    page: int
    size: int
    total: int
    unread_count: int = Field(serialization_alias="unreadCount")

    model_config = ConfigDict(
        populate_by_name=True,
    )


class ListNotificationsResponse(BaseModel):
    status: int
    code: int
    message: str
    data: NotificationListData


class MarkNotificationReadData(BaseModel):
    id: uuid.UUID
    is_read: bool = Field(serialization_alias="isRead")

    model_config = ConfigDict(
        populate_by_name=True,
    )


class MarkNotificationReadResponse(BaseModel):
    status: int
    code: str
    message: str
    data: MarkNotificationReadData


class MarkAllNotificationsReadData(BaseModel):
    updated_count: int = Field(serialization_alias="updatedCount")

    model_config = ConfigDict(
        populate_by_name=True,
    )


class MarkAllNotificationsReadResponse(BaseModel):
    status: int
    code: str
    message: str
    data: MarkAllNotificationsReadData