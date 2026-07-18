import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id, security
from modules.auction_sessions.session_repository import (
    AuctionSessionRepository,
)
from modules.auction_sessions.session_schema import (
    AuctionSessionRuleData,
    CreateAuctionSessionData,
    CreateAuctionSessionRequest,
    CreateAuctionSessionResponse,
)
from modules.auction_sessions.session_service import AuctionSessionService


router = APIRouter(
    prefix="/api/v1/auction-sessions",
    tags=["Auction Sessions"],
    dependencies=[Depends(security)],
)


def get_auction_session_service() -> AuctionSessionService:
    return AuctionSessionService(
        session_repository=AuctionSessionRepository(),
    )


DatabaseSession = Annotated[
    AsyncSession,
    Depends(get_db),
]

AuctionSessionServiceDependency = Annotated[
    AuctionSessionService,
    Depends(get_auction_session_service),
]

CurrentUserId = Annotated[
    uuid.UUID,
    Depends(get_current_user_id),
]


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=CreateAuctionSessionResponse,
)
async def create_auction_session(
    request: CreateAuctionSessionRequest,
    db: DatabaseSession,
    seller_id: CurrentUserId,
    session_service: AuctionSessionServiceDependency,
) -> CreateAuctionSessionResponse:
    session = await session_service.create_session(
        db=db,
        seller_id=seller_id,
        request=request,
    )

    return CreateAuctionSessionResponse(
        status=status.HTTP_201_CREATED,
        code=1000,
        message="Create auction session successfully",
        data=CreateAuctionSessionData(
            id=session.id,
            seller_id=session.seller_id,
            title=session.title,
            description=session.description,
            start_time=session.start_time,
            end_time=session.end_time,
            status=session.status,
            rule=AuctionSessionRuleData.model_validate(session.rules),
        ),
    )
