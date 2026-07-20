import uuid
from datetime import datetime
from decimal import Decimal
from typing import Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    model_validator,
)

from common.enum import AuctionItemStatus, AuctionSessionStatus


class CreateAuctionSessionRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    start_time: datetime = Field(alias="startTime")
    end_time: datetime = Field(alias="endTime")
    min_increment: Decimal = Field(alias="minIncrement", gt=0)

    model_config = ConfigDict(
        populate_by_name=True,
        str_strip_whitespace=True,
    )

    @model_validator(mode="after")
    def validate_times(self) -> Self:
        if self.start_time >= self.end_time:
            raise ValueError("startTime must be before endTime")

        return self


class AuctionSessionRuleData(BaseModel):
    min_increment: Decimal = Field(serialization_alias="minIncrement")

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )


class CreateAuctionSessionData(BaseModel):
    id: uuid.UUID
    seller_id: uuid.UUID = Field(serialization_alias="sellerId")
    title: str
    description: str | None
    start_time: datetime = Field(serialization_alias="startTime")
    end_time: datetime = Field(serialization_alias="endTime")
    status: AuctionSessionStatus
    rule: AuctionSessionRuleData

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )


class CreateAuctionSessionResponse(BaseModel):
    status: int
    code: int
    message: str
    data: CreateAuctionSessionData


class AuctionSessionListItem(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    start_time: datetime = Field(serialization_alias="startTime")
    end_time: datetime = Field(serialization_alias="endTime")
    status: AuctionSessionStatus
    seller_name: str = Field(serialization_alias="sellerName")

    model_config = ConfigDict(
        populate_by_name=True,
    )


class AuctionSessionListData(BaseModel):
    items: list[AuctionSessionListItem]
    page: int
    size: int
    total: int


class ListAuctionSessionsResponse(BaseModel):
    status: int
    code: int
    message: str
    data: AuctionSessionListData


class AuctionSessionSellerData(BaseModel):
    id: uuid.UUID
    full_name: str = Field(serialization_alias="fullName")

    model_config = ConfigDict(
        populate_by_name=True,
    )


class AuctionSessionItemSummary(BaseModel):
    id: uuid.UUID
    title: str
    starting_price: Decimal = Field(serialization_alias="startingPrice")
    current_price: Decimal = Field(serialization_alias="currentPrice")
    status: AuctionItemStatus
    primary_image_url: str | None = Field(
        serialization_alias="primaryImageUrl",
    )

    model_config = ConfigDict(
        populate_by_name=True,
    )


class AuctionSessionDetailData(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    start_time: datetime = Field(serialization_alias="startTime")
    end_time: datetime = Field(serialization_alias="endTime")
    status: AuctionSessionStatus
    seller: AuctionSessionSellerData
    rule: AuctionSessionRuleData
    items: list[AuctionSessionItemSummary]

    model_config = ConfigDict(
        populate_by_name=True,
    )


class GetAuctionSessionDetailResponse(BaseModel):
    status: int
    code: int
    message: str
    data: AuctionSessionDetailData


class StartAuctionSessionData(BaseModel):
    id: uuid.UUID
    status: AuctionSessionStatus
    started_at: datetime = Field(serialization_alias="startedAt")

    model_config = ConfigDict(
        populate_by_name=True,
    )


class StartAuctionSessionResponse(BaseModel):
    status: int
    code: int
    message: str
    data: StartAuctionSessionData
