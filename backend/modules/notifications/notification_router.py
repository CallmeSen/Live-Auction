import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id, security
from modules.notifications.notification_repository import (
    NotificationListFilters,
    NotificationRepository,
)
from modules.notifications.notification_schema import (
    ListNotificationsResponse,
    MarkAllNotificationsReadResponse,
    MarkNotificationReadResponse,
)
from modules.notifications.notification_service import NotificationService


router = APIRouter(
    prefix="/api/v1/notifications",
    tags=["Notifications"],
    dependencies=[Depends(security)],
)


def get_notification_service() -> NotificationService:
    return NotificationService(
        notification_repository=NotificationRepository(),
    )


DatabaseSession = Annotated[
    AsyncSession,
    Depends(get_db),
]

NotificationServiceDependency = Annotated[
    NotificationService,
    Depends(get_notification_service),
]

CurrentUserId = Annotated[
    uuid.UUID,
    Depends(get_current_user_id),
]


@router.get(
    "",
    status_code=status.HTTP_200_OK,
    response_model=ListNotificationsResponse,
)
async def list_notifications(
    db: DatabaseSession,
    current_user_id: CurrentUserId,
    notification_service: NotificationServiceDependency,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 10,
    unread_only: Annotated[bool, Query(alias="unreadOnly")] = False,
) -> ListNotificationsResponse:
    data = await notification_service.list_notifications(
        db=db,
        user_id=current_user_id,
        filters=NotificationListFilters(
            page=page,
            size=size,
            unread_only=unread_only,
        ),
    )

    return ListNotificationsResponse(
        status=status.HTTP_200_OK,
        code=1000,
        message="Get notifications successfully",
        data=data,
    )


@router.patch(
    "/{notification_id}/read",
    status_code=status.HTTP_200_OK,
    response_model=MarkNotificationReadResponse,
)
async def mark_notification_as_read(
    notification_id: uuid.UUID,
    db: DatabaseSession,
    current_user_id: CurrentUserId,
    notification_service: NotificationServiceDependency,
) -> MarkNotificationReadResponse:
    data = await notification_service.mark_as_read(
        db=db,
        notification_id=notification_id,
        user_id=current_user_id,
    )

    return MarkNotificationReadResponse(
        status=status.HTTP_200_OK,
        code="NOTIFICATION_MARKED_READ",
        message="Notification marked as read successfully",
        data=data,
    )


@router.patch(
    "/read-all",
    status_code=status.HTTP_200_OK,
    response_model=MarkAllNotificationsReadResponse,
)
async def mark_all_notifications_as_read(
    db: DatabaseSession,
    current_user_id: CurrentUserId,
    notification_service: NotificationServiceDependency,
) -> MarkAllNotificationsReadResponse:
    data = await notification_service.mark_all_as_read(
        db=db,
        user_id=current_user_id,
    )

    return MarkAllNotificationsReadResponse(
        status=status.HTTP_200_OK,
        code="ALL_NOTIFICATIONS_MARKED_READ",
        message="All notifications marked as read successfully",
        data=data,
    )