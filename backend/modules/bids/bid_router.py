import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import (
    get_current_active_user,
    get_current_user_id,
    security,
)
from app.models.user_model import User
from common.enum import MyBidOutcome
from modules.auction_sessions.session_repository import AuctionSessionRepository
from modules.auction_items.item_repository import AuctionItemRepository
from modules.bids.bid_repository import BidRepository, MyBidListFilters
from modules.bids.bid_schema import (
    ListMyBidsResponse,
    PlaceBidData,
    PlaceBidRequest,
    PlaceBidResponse,
)
from modules.bids.bid_service import BidService
from modules.notifications.notification_repository import NotificationRepository
from modules.notifications.notification_service import NotificationService
from modules.users.notification_preference_repository import (
    NotificationPreferenceRepository,
)


router = APIRouter(
    prefix="/api/v1/auction-items",
    tags=["Bids"],
)

my_bids_router = APIRouter(
    prefix="/api/v1/bids",
    tags=["Bids"],
    dependencies=[Depends(security)],
)


def get_bid_service() -> BidService:
    return BidService(
        bid_repository=BidRepository(),
        item_repository=AuctionItemRepository(),
        session_repository=AuctionSessionRepository(),
        notification_service=NotificationService(
            notification_repository=NotificationRepository(),
            notification_preference_repository=NotificationPreferenceRepository(),
        ),
    )


DatabaseSession = Annotated[
    AsyncSession,
    Depends(get_db),
]

BidServiceDependency = Annotated[
    BidService,
    Depends(get_bid_service),
]

CurrentActiveUser = Annotated[
    User,
    Depends(get_current_active_user),
]

CurrentUserId = Annotated[
    uuid.UUID,
    Depends(get_current_user_id),
]


@my_bids_router.get(
    "/my",
    status_code=status.HTTP_200_OK,
    response_model=ListMyBidsResponse,
)
async def list_my_bids(
    db: DatabaseSession,
    bidder_id: CurrentUserId,
    bid_service: BidServiceDependency,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[
        int,
        Query(alias="pageSize", ge=1, le=100),
    ] = 20,
    outcome_filter: Annotated[
        MyBidOutcome | None,
        Query(alias="outcome"),
    ] = None,
) -> ListMyBidsResponse:
    data = await bid_service.list_my_bids(
        db=db,
        filters=MyBidListFilters(
            bidder_id=bidder_id,
            page=page,
            page_size=page_size,
            outcome=outcome_filter,
        ),
    )

    return ListMyBidsResponse(
        status=status.HTTP_200_OK,
        code=1000,
        message="Get my bids successfully",
        data=data,
    )


@router.post(
    "/{item_id}/bids",
    status_code=status.HTTP_201_CREATED,
    response_model=PlaceBidResponse,
    dependencies=[Depends(security)],
)
async def place_bid(
    item_id: uuid.UUID,
    request: PlaceBidRequest,
    db: DatabaseSession,
    bidder: CurrentActiveUser,
    bid_service: BidServiceDependency,
) -> PlaceBidResponse:
    bid = await bid_service.place_bid(
        db=db,
        item_id=item_id,
        bidder=bidder,
        request=request,
    )

    return PlaceBidResponse(
        status=status.HTTP_201_CREATED,
        code=1000,
        message="Place bid successfully",
        data=PlaceBidData.model_validate(bid),
    )