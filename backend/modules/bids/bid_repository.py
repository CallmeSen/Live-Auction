import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.bid_model import Bid
from common.enum import BidStatus, MyBidOutcome


@dataclass(frozen=True)
class MyBidListFilters:
    bidder_id: uuid.UUID
    page: int
    page_size: int
    outcome: MyBidOutcome | None


class BidRepository:
    async def find_winning_by_item_id(
        self,
        db: AsyncSession,
        item_id: uuid.UUID,
    ) -> Bid | None:
        statement = (
            select(Bid)
            .where(
                Bid.item_id == item_id,
                Bid.status == BidStatus.WINNING,
            )
            .order_by(Bid.amount.desc(), Bid.created_at.asc())
            .limit(1)
        )

        result = await db.execute(statement)

        return result.scalar_one_or_none()

    async def list_all_by_bidder(
        self,
        db: AsyncSession,
        bidder_id: uuid.UUID,
    ) -> list[Bid]:
        statement = (
            select(Bid)
            .options(
                selectinload(Bid.item),
                selectinload(Bid.session),
            )
            .where(Bid.bidder_id == bidder_id)
            .order_by(Bid.created_at.desc())
        )

        result = await db.execute(statement)

        return list(result.scalars().unique().all())

    async def create(
        self,
        db: AsyncSession,
        bid: Bid,
    ) -> Bid:
        db.add(bid)

        await db.flush()
        await db.refresh(bid)

        return bid
