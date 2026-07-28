import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Path, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id, security
from app.core.exceptions import AppException
from app.core.storage import StorageService, get_storage_service
from app.core.config import settings
from common.enum import AuctionItemStatus
from modules.auction_items.item_repository import (
    AuctionItemRepository,
    ItemListFilters,
)
from modules.auction_items.item_schema import (
    AuctionItemSortBy,
    CreateAuctionItemData,
    CreateAuctionItemRequest,
    CreateAuctionItemResponse,
    DeleteAuctionItemData,
    DeleteAuctionItemResponse,
    GetAuctionItemDetailResponse,
    ListAuctionItemsResponse,
    SortOrder,
    UpdateAuctionItemRequest,
    UpdateAuctionItemResponse,
    UploadAuctionItemImageData,
    UploadAuctionItemImageResponse,
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


def get_auction_item_service(
    storage_service: Annotated[
        StorageService,
        Depends(get_storage_service),
    ],
) -> AuctionItemService:
    return AuctionItemService(
        item_repository=AuctionItemRepository(),
        session_repository=AuctionSessionRepository(),
        category_repository=CategoryRepository(),
        storage_service=storage_service,
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
    "",
    status_code=status.HTTP_200_OK,
    response_model=ListAuctionItemsResponse,
)
async def list_auction_items(
    db: DatabaseSession,
    item_service: AuctionItemServiceDependency,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[
        int,
        Query(alias="pageSize", ge=1, le=100),
    ] = 20,
    status_filter: Annotated[
        AuctionItemStatus | None,
        Query(alias="status"),
    ] = None,
    session_id: Annotated[
        uuid.UUID | None,
        Query(alias="sessionId"),
    ] = None,
    category_id: Annotated[
        uuid.UUID | None,
        Query(alias="categoryId"),
    ] = None,
    keyword: Annotated[str | None, Query(max_length=255)] = None,
    sort_by: Annotated[
        AuctionItemSortBy,
        Query(alias="sortBy"),
    ] = AuctionItemSortBy.CREATED_AT,
    sort_order: Annotated[
        SortOrder,
        Query(alias="sortOrder"),
    ] = SortOrder.DESC,
) -> ListAuctionItemsResponse:
    normalized_keyword = keyword.strip() if keyword else None

    if normalized_keyword == "":
        normalized_keyword = None

    data = await item_service.list_items(
        db=db,
        filters=ItemListFilters(
            page=page,
            page_size=page_size,
            status=status_filter,
            session_id=session_id,
            category_id=category_id,
            keyword=normalized_keyword,
            sort_by=sort_by,
            sort_order=sort_order,
        ),
    )

    return ListAuctionItemsResponse(
        status=status.HTTP_200_OK,
        code=1000,
        message="Get auction item list successfully",
        data=data,
    )


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


@public_router.patch(
    "/{item_id}",
    status_code=status.HTTP_200_OK,
    response_model=UpdateAuctionItemResponse,
    dependencies=[Depends(security)],
)
async def update_auction_item(
    item_id: uuid.UUID,
    request: UpdateAuctionItemRequest,
    db: DatabaseSession,
    seller_id: CurrentUserId,
    item_service: AuctionItemServiceDependency,
) -> UpdateAuctionItemResponse:
    item = await item_service.update_item(
        db=db,
        item_id=item_id,
        seller_id=seller_id,
        request=request,
    )

    return UpdateAuctionItemResponse(
        status=status.HTTP_200_OK,
        code=1000,
        message="Update auction item successfully",
        data=CreateAuctionItemData.model_validate(item),
    )


@public_router.delete(
    "/{item_id}",
    status_code=status.HTTP_200_OK,
    response_model=DeleteAuctionItemResponse,
    dependencies=[Depends(security)],
)
async def delete_auction_item(
    item_id: uuid.UUID,
    db: DatabaseSession,
    seller_id: CurrentUserId,
    item_service: AuctionItemServiceDependency,
) -> DeleteAuctionItemResponse:
    deleted_id = await item_service.delete_item(
        db=db,
        item_id=item_id,
        seller_id=seller_id,
    )

    return DeleteAuctionItemResponse(
        status=status.HTTP_200_OK,
        code=1000,
        message="Delete auction item successfully",
        data=DeleteAuctionItemData(id=deleted_id),
    )


@public_router.post(
    "/{item_id}/images",
    status_code=status.HTTP_201_CREATED,
    response_model=UploadAuctionItemImageResponse,
    dependencies=[Depends(security)],
)
async def upload_auction_item_image(
    item_id: uuid.UUID,
    db: DatabaseSession,
    seller_id: CurrentUserId,
    item_service: AuctionItemServiceDependency,
    file: Annotated[UploadFile, File()],
    is_primary: Annotated[bool, Form(alias="isPrimary")] = False,
) -> UploadAuctionItemImageResponse:
    if file.content_type is None:
        raise AppException(
            status_code=status.HTTP_400_BAD_REQUEST,
            code="INVALID_FILE_TYPE",
            message="Unable to determine file type",
        )

    file_content = await file.read()

    if len(file_content) > settings.max_upload_size_bytes:
        raise AppException(
            status_code=status.HTTP_400_BAD_REQUEST,
            code="FILE_TOO_LARGE",
            message=(
                f"File size must not exceed "
                f"{settings.max_upload_size_mb}MB"
            ),
        )

    image = await item_service.upload_image(
        db=db,
        item_id=item_id,
        seller_id=seller_id,
        file_content=file_content,
        original_filename=file.filename or "upload",
        content_type=file.content_type,
        is_primary=is_primary,
    )

    return UploadAuctionItemImageResponse(
        status=status.HTTP_201_CREATED,
        code="IMAGE_UPLOADED",
        message="Upload image successfully",
        data=UploadAuctionItemImageData.model_validate(image),
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