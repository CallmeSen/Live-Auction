import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.bid_model import Bid
from common.enum import BidStatus


@dataclass(frozen=True)
class MyBidListFilters:
    bidder_id: uuid.UUID
    page: int
    page_size: int
    status: BidStatus | None


class BidRepository:
    async def find_winning_by_item_id(
        self,
        db: AsyncSession,
        item_id: uuid.UUID,
    ) -> Bid | None:
        statement = select(Bid).where(
            Bid.item_id == item_id,
            Bid.status == BidStatus.WINNING,
        )

        result = await db.execute(statement)

        return result.scalar_one_or_none()

    async def list_my_bids(
        self,
        db: AsyncSession,
        filters: MyBidListFilters,
    ) -> tuple[list[Bid], int]:
        conditions = [Bid.bidder_id == filters.bidder_id]

        if filters.status is not None:
            conditions.append(Bid.status == filters.status)

        count_statement = select(func.count()).select_from(Bid).where(
            *conditions,
        )

        total_result = await db.execute(count_statement)
        total = total_result.scalar_one()

        offset = (filters.page - 1) * filters.page_size

        statement = (
            select(Bid)
            .options(
                selectinload(Bid.item),
                selectinload(Bid.session),
            )
            .where(*conditions)
            .order_by(Bid.created_at.desc())
            .offset(offset)
            .limit(filters.page_size)
        )

        result = await db.execute(statement)

        return list(result.scalars().unique().all()), total

    async def create(
        self,
        db: AsyncSession,
        bid: Bid,
    ) -> Bid:
        db.add(bid)

        await db.flush()
        await db.refresh(bid)

        return bid
