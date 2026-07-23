import uuid

from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.models.notification_model import Notification
from common.enum import NotificationType
from modules.notifications.notification_repository import (
    NotificationListFilters,
    NotificationRepository,
)
from modules.notifications.notification_schema import (
    MarkAllNotificationsReadData,
    MarkNotificationReadData,
    NotificationItem,
    NotificationListData,
)
from modules.users.notification_preference_repository import (
    NotificationPreferenceRepository,
)


class NotificationService:
    def __init__(
        self,
        notification_repository: NotificationRepository,
        notification_preference_repository: NotificationPreferenceRepository | None = None,
    ) -> None:
        self.notification_repository = notification_repository
        self.notification_preference_repository = (
            notification_preference_repository or NotificationPreferenceRepository()
        )

    async def list_notifications(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
        filters: NotificationListFilters,
    ) -> NotificationListData:
        notifications, total = await self.notification_repository.list_notifications(
            db=db,
            user_id=user_id,
            filters=filters,
        )

        unread_count = await self.notification_repository.count_unread(
            db=db,
            user_id=user_id,
        )

        return NotificationListData(
            items=[
                NotificationItem.model_validate(notification)
                for notification in notifications
            ],
            page=filters.page,
            size=filters.size,
            total=total,
            unread_count=unread_count,
        )

    async def mark_as_read(
        self,
        db: AsyncSession,
        notification_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> MarkNotificationReadData:
        notification = await self.notification_repository.find_by_id_for_user(
            db=db,
            notification_id=notification_id,
            user_id=user_id,
        )

        if notification is None:
            raise AppException(
                status_code=status.HTTP_404_NOT_FOUND,
                code="NOTIFICATION_NOT_FOUND",
                message="Notification not found",
            )

        updated = await self.notification_repository.mark_as_read(
            db=db,
            notification=notification,
        )
        await db.commit()

        return MarkNotificationReadData(
            id=updated.id,
            is_read=updated.is_read,
        )

    async def mark_all_as_read(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
    ) -> MarkAllNotificationsReadData:
        updated_count = await self.notification_repository.mark_all_as_read(
            db=db,
            user_id=user_id,
        )
        await db.commit()

        return MarkAllNotificationsReadData(updated_count=updated_count)

    async def notify_outbid(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
        item_id: uuid.UUID,
        item_title: str,
    ) -> None:
        preference = await self.notification_preference_repository.find_by_user_id(
            db=db,
            user_id=user_id,
        )

        if preference is not None and not preference.notify_when_outbid:
            return

        notification = Notification(
            user_id=user_id,
            type=NotificationType.BID,
            title="Bạn đã bị trả giá cao hơn",
            message=f'Có người vừa đặt giá cao hơn cho vật phẩm "{item_title}".',
            action_url=f"/auction-items/{item_id}",
            is_read=False,
        )

        await self.notification_repository.create(
            db=db,
            notification=notification,
        )

    async def notify_session_approved(
        self,
        db: AsyncSession,
        seller_id: uuid.UUID,
        session_id: uuid.UUID,
        session_title: str,
    ) -> None:
        notification = Notification(
            user_id=seller_id,
            type=NotificationType.AUCTION,
            title="Phiên đấu giá đã được duyệt",
            message=f'Phiên đấu giá "{session_title}" của bạn đã được duyệt và lên lịch.',
            action_url=f"/auction-sessions/{session_id}",
            is_read=False,
        )

        # Không commit ở đây — để nằm chung transaction với nơi gọi
        # (AuctionSessionService.approve_session).
        await self.notification_repository.create(
            db=db,
            notification=notification,
        )

    async def notify_session_rejected(
        self,
        db: AsyncSession,
        seller_id: uuid.UUID,
        session_id: uuid.UUID,
        session_title: str,
        reason: str | None,
    ) -> None:
        message = f'Phiên đấu giá "{session_title}" của bạn đã bị từ chối.'

        if reason:
            message += f" Lý do: {reason}"

        notification = Notification(
            user_id=seller_id,
            type=NotificationType.AUCTION,
            title="Phiên đấu giá bị từ chối",
            message=message,
            action_url=f"/auction-sessions/{session_id}",
            is_read=False,
        )

        await self.notification_repository.create(
            db=db,
            notification=notification,
        )