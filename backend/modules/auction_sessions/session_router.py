import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id, security
from common.enum import AuctionSessionStatus
from modules.auction_sessions.session_repository import (
    AuctionSessionRepository,
    SessionListFilters,
)
from modules.auction_sessions.session_schema import (
    AuctionSessionRuleData,
    CreateAuctionSessionData,
    CreateAuctionSessionRequest,
    CreateAuctionSessionResponse,
    ListAuctionSessionsResponse,
)
from modules.auction_sessions.session_service import AuctionSessionService


router = APIRouter(
    prefix="/api/v1/auction-sessions",
    tags=["Auction Sessions"],
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


@router.get(
    "",
    status_code=status.HTTP_200_OK,
    response_model=ListAuctionSessionsResponse,
)
async def list_auction_sessions(
    db: DatabaseSession,
    session_service: AuctionSessionServiceDependency,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 10,
    status_filter: Annotated[
        AuctionSessionStatus | None,
        Query(alias="status"),
    ] = None,
    keyword: Annotated[str | None, Query(max_length=255)] = None,
) -> ListAuctionSessionsResponse:
    normalized_keyword = keyword.strip() if keyword else None

    if normalized_keyword == "":
        normalized_keyword = None

    data = await session_service.list_sessions(
        db=db,
        filters=SessionListFilters(
            page=page,
            size=size,
            status=status_filter,
            keyword=normalized_keyword,
        ),
    )

    return ListAuctionSessionsResponse(
        status=status.HTTP_200_OK,
        code=1000,
        message="Get auction sessions successfully",
        data=data,
    )


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=CreateAuctionSessionResponse,
    dependencies=[Depends(security)],
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
