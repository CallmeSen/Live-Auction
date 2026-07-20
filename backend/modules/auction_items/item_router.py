import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Path, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id, security
from modules.auction_items.item_repository import AuctionItemRepository
from modules.auction_items.item_schema import (
    CreateAuctionItemData,
    CreateAuctionItemRequest,
    CreateAuctionItemResponse,
    GetAuctionItemDetailResponse,
)
from modules.auction_items.item_service import AuctionItemService
from modules.auction_sessions.session_repository import (
    AuctionSessionRepository,
)
from modules.categories.category_repository import CategoryRepository


router = APIRouter(
    prefix="/api/v1/auction-sessions",
    tags=["Auction Items"],
    dependencies=[Depends(security)],
)

public_router = APIRouter(
    prefix="/api/v1/auction-items",
    tags=["Auction Items"],
)


def get_auction_item_service() -> AuctionItemService:
    return AuctionItemService(
        item_repository=AuctionItemRepository(),
        session_repository=AuctionSessionRepository(),
        category_repository=CategoryRepository(),
    )


DatabaseSession = Annotated[
    AsyncSession,
    Depends(get_db),
]

AuctionItemServiceDependency = Annotated[
    AuctionItemService,
    Depends(get_auction_item_service),
]

CurrentUserId = Annotated[
    uuid.UUID,
    Depends(get_current_user_id),
]


@public_router.get(
    "/{item_id}",
    status_code=status.HTTP_200_OK,
    response_model=GetAuctionItemDetailResponse,
)
async def get_auction_item_detail(
    item_id: uuid.UUID,
    db: DatabaseSession,
    item_service: AuctionItemServiceDependency,
) -> GetAuctionItemDetailResponse:
    data = await item_service.get_item_detail(
        db=db,
        item_id=item_id,
    )

    return GetAuctionItemDetailResponse(
        status=status.HTTP_200_OK,
        code=1000,
        message="Get auction item detail successfully",
        data=data,
    )


@router.post(
    "/{session_id}/items",
    status_code=status.HTTP_201_CREATED,
    response_model=CreateAuctionItemResponse,
)
async def create_auction_item(
    session_id: Annotated[
        uuid.UUID,
        Path(
            description="Auction session UUID.",
            examples=["4381bbad-04ac-4088-b0b4-85fca226ef68d"],
        ),
    ],
    request: CreateAuctionItemRequest,
    db: DatabaseSession,
    seller_id: CurrentUserId,
    item_service: AuctionItemServiceDependency,
) -> CreateAuctionItemResponse:
    item = await item_service.create_item(
        db=db,
        session_id=session_id,
        seller_id=seller_id,
        request=request,
    )

    return CreateAuctionItemResponse(
        status=status.HTTP_201_CREATED,
        code=1000,
        message="Create auction item successfully",
        data=CreateAuctionItemData.model_validate(item),
    )
