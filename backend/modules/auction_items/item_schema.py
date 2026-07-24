import uuid
from datetime import datetime
from decimal import Decimal
from enum import Enum

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
)

from common.enum import AuctionItemStatus, AuctionSessionStatus, BidStatus


class AuctionItemSortBy(str, Enum):
    CREATED_AT = "createdAt"
    CURRENT_PRICE = "currentPrice"
    STARTING_PRICE = "startingPrice"
    TITLE = "title"
    OPENED_AT = "openedAt"
    CLOSED_AT = "closedAt"


class SortOrder(str, Enum):
    ASC = "asc"
    DESC = "desc"


class CreateAuctionItemRequest(BaseModel):
    category_id: uuid.UUID | None = Field(default=None, alias="categoryId")
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    starting_price: Decimal = Field(alias="startingPrice", gt=0)

    model_config = ConfigDict(
        populate_by_name=True,
        str_strip_whitespace=True,
    )


class CreateAuctionItemData(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID = Field(serialization_alias="sessionId")
    seller_id: uuid.UUID = Field(serialization_alias="sellerId")
    category_id: uuid.UUID | None = Field(serialization_alias="categoryId")
    title: str
    description: str | None
    starting_price: Decimal = Field(serialization_alias="startingPrice")
    current_price: Decimal = Field(serialization_alias="currentPrice")
    status: AuctionItemStatus

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )


class CreateAuctionItemResponse(BaseModel):
    status: int
    code: int
    message: str
    data: CreateAuctionItemData


class AuctionItemSellerData(BaseModel):
    id: uuid.UUID
    full_name: str = Field(serialization_alias="fullName")

    model_config = ConfigDict(
        populate_by_name=True,
    )


class AuctionItemSessionData(BaseModel):
    id: uuid.UUID
    title: str
    status: AuctionSessionStatus
    end_time: datetime = Field(serialization_alias="endTime")
    min_increment: Decimal = Field(serialization_alias="minIncrement")

    model_config = ConfigDict(
        populate_by_name=True,
    )


class AuctionItemImageData(BaseModel):
    image_url: str | None = Field(serialization_alias="imageUrl")
    is_primary: bool = Field(serialization_alias="isPrimary")

    model_config = ConfigDict(
        populate_by_name=True,
    )


class AuctionItemBidData(BaseModel):
    id: uuid.UUID
    bidder_name: str = Field(serialization_alias="bidderName")
    amount: Decimal
    status: BidStatus
    created_at: datetime = Field(serialization_alias="createdAt")

    model_config = ConfigDict(
        populate_by_name=True,
    )


class AuctionItemDetailData(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID = Field(serialization_alias="sessionId")
    title: str
    description: str | None
    starting_price: Decimal = Field(serialization_alias="startingPrice")
    current_price: Decimal = Field(serialization_alias="currentPrice")
    status: AuctionItemStatus
    seller: AuctionItemSellerData
    session: AuctionItemSessionData
    images: list[AuctionItemImageData]
    bids: list[AuctionItemBidData]

    model_config = ConfigDict(
        populate_by_name=True,
    )


class GetAuctionItemDetailResponse(BaseModel):
    status: int
    code: int
    message: str
    data: AuctionItemDetailData


class AuctionItemListCategoryData(BaseModel):
    id: uuid.UUID
    name: str
    slug: str

    model_config = ConfigDict(
        populate_by_name=True,
    )


class AuctionItemListSessionData(BaseModel):
    id: uuid.UUID
    title: str
    status: AuctionSessionStatus
    start_time: datetime = Field(serialization_alias="startTime")
    end_time: datetime = Field(serialization_alias="endTime")
    min_increment: Decimal = Field(serialization_alias="minIncrement")

    model_config = ConfigDict(
        populate_by_name=True,
    )


class AuctionItemListItem(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    starting_price: Decimal = Field(serialization_alias="startingPrice")
    current_price: Decimal = Field(serialization_alias="currentPrice")
    final_price: Decimal | None = Field(serialization_alias="finalPrice")
    status: AuctionItemStatus
    opened_at: datetime | None = Field(serialization_alias="openedAt")
    closed_at: datetime | None = Field(serialization_alias="closedAt")
    created_at: datetime = Field(serialization_alias="createdAt")
    primary_image_url: str | None = Field(serialization_alias="primaryImageUrl")
    bid_count: int = Field(serialization_alias="bidCount")
    seller: AuctionItemSellerData
    category: AuctionItemListCategoryData | None
    session: AuctionItemListSessionData

    model_config = ConfigDict(
        populate_by_name=True,
    )


class AuctionItemListData(BaseModel):
    items: list[AuctionItemListItem]
    page: int
    page_size: int = Field(serialization_alias="pageSize")
    total: int
    total_pages: int = Field(serialization_alias="totalPages")


class ListAuctionItemsResponse(BaseModel):
    status: int
    code: int
    message: str
    data: AuctionItemListData


class UploadAuctionItemImageData(BaseModel):
    id: uuid.UUID
    item_id: uuid.UUID = Field(serialization_alias="itemId")
    image_url: str = Field(serialization_alias="imageUrl")
    is_primary: bool = Field(serialization_alias="isPrimary")
    sort_order: int = Field(serialization_alias="sortOrder")
    created_at: datetime = Field(serialization_alias="createdAt")

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )


class UploadAuctionItemImageResponse(BaseModel):
    status: int
    code: str
    message: str
    data: UploadAuctionItemImageData