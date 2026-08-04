import uuid

from fastapi import status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.use_cases.realtime.publish_auction_item_timeline_event import (
    PublishAuctionItemTimelineEventUseCase,
)
from app.core.exceptions import AppException
from app.domain.events.auction_lifecycle_events import create_auction_started_event
from app.models.image_model import ItemImage
from app.models.user_model import User
from app.models.auction_session_rule_model import AuctionSessionRule
from app.models.session_model import AuctionSession
from app.utils.datetime_utils import vietnam_now_naive
from common.enum import AuctionItemStatus, AuctionSessionStatus, UserRole
from modules.auction_sessions.session_repository import (
    AuctionSessionRepository,
    SessionListFilters,
)
from modules.auction_sessions.session_schema import (
    ApproveAuctionSessionData,
    AuctionSessionDetailData,
    AuctionSessionItemSummary,
    AuctionSessionListData,
    AuctionSessionListItem,
    AuctionSessionRuleData,
    AuctionSessionSellerData,
    CancelAuctionSessionData,
    CreateAuctionSessionRequest,
    RejectAuctionSessionData,
    StartAuctionSessionData,
)
from modules.notifications.notification_service import NotificationService


class AuctionSessionService:
    def __init__(
        self,
        session_repository: AuctionSessionRepository,
        notification_service: NotificationService,
        publish_timeline_event_use_case: (
            PublishAuctionItemTimelineEventUseCase | None
        ) = None,
    ) -> None:
        self.session_repository = session_repository
        self.notification_service = notification_service
        self.publish_timeline_event_use_case = publish_timeline_event_use_case

    async def _synchronize_time_based_statuses(
        self,
        db: AsyncSession,
    ) -> None:
        changed_count = (
            await self.session_repository.synchronize_time_based_statuses(
                db=db,
                current_time=vietnam_now_naive(),
            )
        )

        if changed_count > 0:
            await db.commit()

    @staticmethod
    def _get_primary_image_url(
        images: list[ItemImage],
    ) -> str | None:
        if not images:
            return None

        for image in images:
            if image.is_primary:
                return image.image_url

        return images[0].image_url

    async def get_session_detail(
        self,
        db: AsyncSession,
        session_id: uuid.UUID,
    ) -> AuctionSessionDetailData:
        await self._synchronize_time_based_statuses(db)

        session = await self.session_repository.find_detail_by_id(
            db=db,
            session_id=session_id,
        )

        if session is None:
            raise AppException(
                status_code=status.HTTP_404_NOT_FOUND,
                code="SESSION_NOT_FOUND",
                message="Auction session not found",
            )

        if session.rules is None:
            raise AppException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                code="SESSION_RULE_NOT_FOUND",
                message="Auction session rule not found",
            )

        items = [
            AuctionSessionItemSummary(
                id=item.id,
                title=item.title,
                starting_price=item.starting_price,
                current_price=item.current_price,
                status=item.status,
                primary_image_url=self._get_primary_image_url(
                    item.images,
                ),
            )
            for item in session.items
        ]

        return AuctionSessionDetailData(
            id=session.id,
            title=session.title,
            description=session.description,
            start_time=session.start_time,
            end_time=session.end_time,
            status=session.status,
            seller=AuctionSessionSellerData(
                id=session.seller.id,
                full_name=session.seller.full_name,
            ),
            rule=AuctionSessionRuleData.model_validate(session.rules),
            items=items,
        )

    async def list_sessions(
        self,
        db: AsyncSession,
        filters: SessionListFilters,
    ) -> AuctionSessionListData:
        await self._synchronize_time_based_statuses(db)

        sessions, total = await self.session_repository.list_sessions(
            db=db,
            filters=filters,
        )

        items = [
            AuctionSessionListItem(
                id=session.id,
                title=session.title,
                description=session.description,
                start_time=session.start_time,
                end_time=session.end_time,
                status=session.status,
                seller_name=session.seller.full_name,
                primary_image_url=next(
                    (
                        image.image_url
                        for item in session.items
                        for image in sorted(
                            item.images,
                            key=lambda current_image: (
                                not current_image.is_primary,
                                current_image.sort_order,
                            ),
                        )
                        if image.image_url
                    ),
                    None,
                ),
            )
            for session in sessions
        ]

        return AuctionSessionListData(
            items=items,
            page=filters.page,
            size=filters.size,
            total=total,
        )

    async def create_session(
        self,
        db: AsyncSession,
        seller_id: uuid.UUID,
        request: CreateAuctionSessionRequest,
    ) -> AuctionSession:
        session = AuctionSession(
            seller_id=seller_id,
            title=request.title,
            description=request.description,
            start_time=request.start_time,
            end_time=request.end_time,
            status=AuctionSessionStatus.SCHEDULED,
            rules=AuctionSessionRule(
                min_increment=request.min_increment,
            ),
        )

        try:
            created_session = await self.session_repository.create(
                db=db,
                session=session,
            )
            await db.commit()
            await db.refresh(created_session, attribute_names=["rules"])

            return created_session

        except IntegrityError as exception:
            await db.rollback()

            raise AppException(
                status_code=400,
                code="CREATE_SESSION_FAILED",
                message="Unable to create auction session",
            ) from exception

        except Exception:
            await db.rollback()
            raise

    @staticmethod
    def _item_is_available_for_auction(item) -> bool:
        return item.status == AuctionItemStatus.UNSOLD

    @staticmethod
    def _cancel_unsold_session_items(session: AuctionSession) -> None:
        for item in session.items:
            if item.status == AuctionItemStatus.UNSOLD:
                item.status = AuctionItemStatus.CANCELLED

    async def _activate_session_items(
        self,
        session: AuctionSession,
        current_time,
    ) -> None:
        for item in session.items:
            if not self._item_is_available_for_auction(item):
                continue

            if item.opened_at is None:
                item.opened_at = current_time

    async def _publish_auction_started_events(
        self,
        session: AuctionSession,
    ) -> None:
        if self.publish_timeline_event_use_case is None:
            return

        for item in session.items:
            if not self._item_is_available_for_auction(item):
                continue

            try:
                await self.publish_timeline_event_use_case.execute(
                    item_id=item.id,
                    event=create_auction_started_event(item_id=item.id),
                )
            except Exception:
                # Realtime publication failure must not undo a committed start.
                pass

    async def start_session(
        self,
        db: AsyncSession,
        session_id: uuid.UUID,
        current_user: User,
    ) -> StartAuctionSessionData:
        try:
            session = await self.session_repository.find_by_id_for_update(
                db=db,
                session_id=session_id,
            )

            if session is None:
                raise AppException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    code="AUCTION_SESSION_NOT_FOUND",
                    message="Auction session not found",
                )

            is_admin = current_user.role == UserRole.ADMIN
            is_owner = session.seller_id == current_user.id

            if not is_admin and not is_owner:
                raise AppException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    code="AUCTION_SESSION_ACCESS_DENIED",
                    message="You do not have permission to start this session",
                )

            if session.status != AuctionSessionStatus.SCHEDULED:
                raise AppException(
                    status_code=status.HTTP_409_CONFLICT,
                    code="INVALID_SESSION_STATUS",
                    message="Auction session is not in SCHEDULED status",
                )

            if session.rules is None:
                raise AppException(
                    status_code=status.HTTP_409_CONFLICT,
                    code="SESSION_RULES_REQUIRED",
                    message="Auction session rules have not been configured",
                )

            current_time = vietnam_now_naive()

            if current_time < session.start_time:
                raise AppException(
                    status_code=status.HTTP_409_CONFLICT,
                    code="SESSION_NOT_STARTED_YET",
                    message="Auction session has not reached its start time",
                )

            if current_time >= session.end_time:
                session.status = AuctionSessionStatus.ENDED
                await db.commit()

                raise AppException(
                    status_code=status.HTTP_409_CONFLICT,
                    code="SESSION_ALREADY_ENDED",
                    message="Auction session has already ended",
                )

            session.status = AuctionSessionStatus.ACTIVE
            self._activate_session_items(session, current_time)

            await db.commit()

            await self._publish_auction_started_events(session)

            return StartAuctionSessionData(
                id=session.id,
                status=session.status,
                started_at=current_time,
            )

        except AppException:
            await db.rollback()
            raise

        except IntegrityError as exception:
            await db.rollback()

            raise AppException(
                status_code=status.HTTP_409_CONFLICT,
                code="START_SESSION_FAILED",
                message="Unable to start auction session",
            ) from exception

        except Exception:
            await db.rollback()
            raise

    async def approve_session(
        self,
        db: AsyncSession,
        session_id: uuid.UUID,
    ) -> ApproveAuctionSessionData:
        try:
            session = await self.session_repository.find_by_id_for_update(
                db=db,
                session_id=session_id,
            )

            if session is None:
                raise AppException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    code="AUCTION_SESSION_NOT_FOUND",
                    message="Auction session not found",
                )

            if session.status != AuctionSessionStatus.SCHEDULED:
                raise AppException(
                    status_code=status.HTTP_409_CONFLICT,
                    code="INVALID_SESSION_STATUS",
                    message="Only scheduled auction sessions can be approved",
                )

            if len(session.items) == 0:
                raise AppException(
                    status_code=status.HTTP_409_CONFLICT,
                    code="SESSION_HAS_NO_ITEMS",
                    message=(
                        "Auction session must contain at least one item "
                        "before approval"
                    ),
                )

            current_time = vietnam_now_naive()

            if current_time >= session.end_time:
                session.status = AuctionSessionStatus.ENDED
                await db.commit()

                raise AppException(
                    status_code=status.HTTP_409_CONFLICT,
                    code="SESSION_APPROVAL_WINDOW_EXPIRED",
                    message=(
                        "Auction session cannot be approved after its end time"
                    ),
                )

            if current_time >= session.start_time:
                session.status = AuctionSessionStatus.ACTIVE
                self._activate_session_items(session, current_time)

            await self.notification_service.notify_session_approved(
                db=db,
                seller_id=session.seller_id,
                session_id=session.id,
                session_title=session.title,
            )

            await db.commit()

            if session.status == AuctionSessionStatus.ACTIVE:
                await self._publish_auction_started_events(session)

            return ApproveAuctionSessionData(
                id=session.id,
                status=session.status,
                approved_at=current_time,
            )

        except AppException:
            await db.rollback()
            raise

        except Exception:
            await db.rollback()
            raise

    async def reject_session(
        self,
        db: AsyncSession,
        session_id: uuid.UUID,
        reason: str | None,
    ) -> RejectAuctionSessionData:
        try:
            session = await self.session_repository.find_by_id_for_update(
                db=db,
                session_id=session_id,
            )

            if session is None:
                raise AppException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    code="AUCTION_SESSION_NOT_FOUND",
                    message="Auction session not found",
                )

            if session.status != AuctionSessionStatus.SCHEDULED:
                raise AppException(
                    status_code=status.HTTP_409_CONFLICT,
                    code="INVALID_SESSION_STATUS",
                    message="Only scheduled auction sessions can be rejected",
                )

            session.status = AuctionSessionStatus.CANCELLED
            current_time = vietnam_now_naive()

            self._cancel_unsold_session_items(session)

            await self.notification_service.notify_session_rejected(
                db=db,
                seller_id=session.seller_id,
                session_id=session.id,
                session_title=session.title,
                reason=reason,
            )

            await db.commit()

            return RejectAuctionSessionData(
                id=session.id,
                status=session.status,
                rejected_at=current_time,
                reason=reason,
            )

        except AppException:
            await db.rollback()
            raise

        except Exception:
            await db.rollback()
            raise

    async def cancel_session(
        self,
        db: AsyncSession,
        session_id: uuid.UUID,
        reason: str | None,
    ) -> CancelAuctionSessionData:
        try:
            session = await self.session_repository.find_by_id_for_update(
                db=db,
                session_id=session_id,
            )

            if session is None:
                raise AppException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    code="AUCTION_SESSION_NOT_FOUND",
                    message="Auction session not found",
                )

            if session.status != AuctionSessionStatus.SCHEDULED:
                raise AppException(
                    status_code=status.HTTP_409_CONFLICT,
                    code="INVALID_SESSION_STATUS",
                    message="Only scheduled auction sessions can be cancelled",
                )

            current_time = vietnam_now_naive()

            if current_time >= session.start_time:
                raise AppException(
                    status_code=status.HTTP_409_CONFLICT,
                    code="SESSION_ALREADY_STARTED",
                    message="Auction session can no longer be cancelled after its start time",
                )

            session.status = AuctionSessionStatus.CANCELLED

            self._cancel_unsold_session_items(session)

            await self.notification_service.notify_session_cancelled(
                db=db,
                seller_id=session.seller_id,
                session_id=session.id,
                session_title=session.title,
                reason=reason,
            )

            await db.commit()

            return CancelAuctionSessionData(
                id=session.id,
                status=session.status,
                cancelled_at=current_time,
                reason=reason,
            )

        except AppException:
            await db.rollback()
            raise

        except Exception:
            await db.rollback()
            raise
