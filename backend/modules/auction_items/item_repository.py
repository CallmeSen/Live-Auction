import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.bid_model import Bid
from app.models.item_model import AuctionItem
from app.models.session_model import AuctionSession


class AuctionItemRepository:
    async def find_detail_by_id(
        self,
        db: AsyncSession,
        item_id: uuid.UUID,
    ) -> AuctionItem | None:
        statement = (
            select(AuctionItem)
            .options(
                selectinload(AuctionItem.seller),
                selectinload(AuctionItem.category),
                selectinload(AuctionItem.images),
                selectinload(AuctionItem.session).selectinload(
                    AuctionSession.rules,
                ),
                selectinload(AuctionItem.bids).selectinload(Bid.bidder),
            )
            .where(AuctionItem.id == item_id)
        )

        result = await db.execute(statement)

        return result.scalar_one_or_none()

    async def find_by_id_for_update(
        self,
        db: AsyncSession,
        item_id: uuid.UUID,
    ) -> AuctionItem | None:
        statement = (
            select(AuctionItem)
            .options(
                selectinload(AuctionItem.session).selectinload(
                    AuctionSession.rules,
                ),
            )
            .where(AuctionItem.id == item_id)
            .with_for_update()
        )

        result = await db.execute(statement)

        return result.scalar_one_or_none()

    async def create(
        self,
        db: AsyncSession,
        item: AuctionItem,
    ) -> AuctionItem:
        db.add(item)

        await db.flush()
        await db.refresh(item)

        return item
