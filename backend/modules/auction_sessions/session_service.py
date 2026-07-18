import uuid

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from common.enum import AuctionSessionStatus
from modules.auction_session_rule.auction_session_rule_model import (
    AuctionSessionRule,
)
from modules.auction_sessions.session_model import AuctionSession
from modules.auction_sessions.session_repository import (
    AuctionSessionRepository,
)
from modules.auction_sessions.session_schema import (
    CreateAuctionSessionRequest,
)


class AuctionSessionService:
    def __init__(
        self,
        session_repository: AuctionSessionRepository,
    ) -> None:
        self.session_repository = session_repository

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
