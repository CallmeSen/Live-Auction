import uuid
from decimal import Decimal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
)

from common.enum import AuctionItemStatus
from common.uuid_utils import OptionalFlexibleUUID


class CreateAuctionItemRequest(BaseModel):
    category_id: OptionalFlexibleUUID = Field(default=None, alias="categoryId")
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
