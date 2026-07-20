import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
)

from common.enum import AuctionItemStatus, AuctionSessionStatus, BidStatus


class PlaceBidRequest(BaseModel):
    amount: Decimal = Field(gt=0)

    model_config = ConfigDict(
        str_strip_whitespace=True,
    )


class PlaceBidData(BaseModel):
    id: uuid.UUID
    item_id: uuid.UUID = Field(serialization_alias="itemId")
    session_id: uuid.UUID = Field(serialization_alias="sessionId")
    bidder_id: uuid.UUID = Field(serialization_alias="bidderId")
    amount: Decimal
    status: BidStatus
    created_at: datetime = Field(serialization_alias="createdAt")

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )


class PlaceBidResponse(BaseModel):
    status: int
    code: int
    message: str
    data: PlaceBidData


class MyBidListItem(BaseModel):
    id: uuid.UUID
    amount: Decimal
    status: BidStatus
    created_at: datetime = Field(serialization_alias="createdAt")
    item_id: uuid.UUID = Field(serialization_alias="itemId")
    item_title: str = Field(serialization_alias="itemTitle")
    item_status: AuctionItemStatus = Field(serialization_alias="itemStatus")
    item_current_price: Decimal = Field(
        serialization_alias="itemCurrentPrice",
    )
    session_id: uuid.UUID = Field(serialization_alias="sessionId")
    session_title: str = Field(serialization_alias="sessionTitle")
    session_status: AuctionSessionStatus = Field(
        serialization_alias="sessionStatus",
    )

    model_config = ConfigDict(
        populate_by_name=True,
    )


class MyBidListData(BaseModel):
    items: list[MyBidListItem]
    page: int
    page_size: int = Field(serialization_alias="pageSize")
    total: int


class ListMyBidsResponse(BaseModel):
    status: int
    code: int
    message: str
    data: MyBidListData
