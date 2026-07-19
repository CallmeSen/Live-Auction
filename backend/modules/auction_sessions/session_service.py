import uuid

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from common.enum import AuctionSessionStatus
from app.models.auction_session_rule_model import AuctionSessionRule
from app.models.session_model import AuctionSession
from modules.auction_sessions.session_repository import (
    AuctionSessionRepository,
    SessionListFilters,
)
from modules.auction_sessions.session_schema import (
    AuctionSessionListData,
    AuctionSessionListItem,
    CreateAuctionSessionRequest,
)


class AuctionSessionService:
    def __init__(
        self,
        session_repository: AuctionSessionRepository,
    ) -> None:
        self.session_repository = session_repository

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
