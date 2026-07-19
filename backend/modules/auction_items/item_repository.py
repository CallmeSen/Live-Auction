from sqlalchemy.ext.asyncio import AsyncSession

from modules.auction_items.item_model import AuctionItem


class AuctionItemRepository:
    async def create(
        self,
        db: AsyncSession,
        item: AuctionItem,
    ) -> AuctionItem:
        db.add(item)

        await db.flush()
        await db.refresh(item)

        return item
