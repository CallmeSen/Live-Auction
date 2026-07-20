import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
)

from common.enum import AuctionItemStatus, AuctionSessionStatus, BidStatus


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
    image_url: str = Field(serialization_alias="imageUrl")
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
