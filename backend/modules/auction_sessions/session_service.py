import uuid
from datetime import datetime

from fastapi import status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.models.image_model import ItemImage
from app.models.user_model import User
from common.enum import AuctionItemStatus, AuctionSessionStatus, UserRole
from app.models.auction_session_rule_model import AuctionSessionRule
from app.models.session_model import AuctionSession
from modules.auction_sessions.session_repository import (
    AuctionSessionRepository,
    SessionListFilters,
)
from modules.auction_sessions.session_schema import (
    AuctionSessionDetailData,
    AuctionSessionItemSummary,
    AuctionSessionListData,
    AuctionSessionListItem,
    AuctionSessionRuleData,
    AuctionSessionSellerData,
    CreateAuctionSessionRequest,
    StartAuctionSessionData,
)


class AuctionSessionService:
    def __init__(
        self,
        session_repository: AuctionSessionRepository,
    ) -> None:
        self.session_repository = session_repository

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
            status=AuctionSessionStatus.INACTIVE,
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

            current_time = datetime.now()

            if current_time < session.start_time:
                raise AppException(
                    status_code=status.HTTP_409_CONFLICT,
                    code="SESSION_NOT_STARTED_YET",
                    message="Auction session has not reached its start time",
                )

            if current_time >= session.end_time:
                raise AppException(
                    status_code=status.HTTP_409_CONFLICT,
                    code="SESSION_ALREADY_ENDED",
                    message="Auction session has already ended",
                )

            session.status = AuctionSessionStatus.ACTIVE

            for item in session.items:
                if item.status == AuctionItemStatus.READY:
                    item.status = AuctionItemStatus.OPEN
                    item.opened_at = current_time

            await db.commit()

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
