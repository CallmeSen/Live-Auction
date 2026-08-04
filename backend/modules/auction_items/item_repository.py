import uuid
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import exists, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.application.dto.auction_item_realtime_snapshot import (
    AuctionItemRealtimeSnapshot,
)
from app.models.auction_session_rule_model import AuctionSessionRule
from app.models.bid_model import Bid
from app.models.image_model import ItemImage
from app.models.item_model import AuctionItem
from app.models.session_model import AuctionSession
from common.enum import AuctionItemStatus
from modules.auction_items.item_schema import AuctionItemSortBy, SortOrder


@dataclass(frozen=True)
class ItemListFilters:
    page: int
    page_size: int
    status: AuctionItemStatus | None
    session_id: uuid.UUID | None
    category_id: uuid.UUID | None
    keyword: str | None
    sort_by: AuctionItemSortBy
    sort_order: SortOrder


SORT_COLUMN_MAP = {
    AuctionItemSortBy.CREATED_AT: AuctionItem.created_at,
    AuctionItemSortBy.CURRENT_PRICE: AuctionItem.current_price,
    AuctionItemSortBy.STARTING_PRICE: AuctionItem.starting_price,
    AuctionItemSortBy.TITLE: AuctionItem.title,
    AuctionItemSortBy.OPENED_AT: AuctionItem.opened_at,
    AuctionItemSortBy.CLOSED_AT: AuctionItem.closed_at,
}


class AuctionItemRepository:
    def _build_list_conditions(
        self,
        filters: ItemListFilters,
    ) -> list:
        conditions = []

        if filters.status is not None:
            conditions.append(AuctionItem.status == filters.status)

        if filters.session_id is not None:
            conditions.append(AuctionItem.session_id == filters.session_id)

        if filters.category_id is not None:
            conditions.append(AuctionItem.category_id == filters.category_id)

        if filters.keyword:
            keyword_pattern = f"%{filters.keyword.lower()}%"
            conditions.append(
                or_(
                    func.lower(AuctionItem.title).like(keyword_pattern),
                    func.lower(AuctionItem.description).like(keyword_pattern),
                ),
            )

        return conditions

    async def list_items(
        self,
        db: AsyncSession,
        filters: ItemListFilters,
    ) -> tuple[list[tuple[AuctionItem, int, str | None]], int]:
        conditions = self._build_list_conditions(filters)
        offset = (filters.page - 1) * filters.page_size

        bid_count_subquery = (
            select(
                Bid.item_id,
                func.count(Bid.id).label("bid_count"),
            )
            .group_by(Bid.item_id)
            .subquery()
        )

        primary_image_subquery = (
            select(ItemImage.image_url)
            .where(
                ItemImage.item_id == AuctionItem.id,
                ItemImage.is_primary.is_(True),
            )
            .limit(1)
            .correlate(AuctionItem)
            .scalar_subquery()
        )

        count_statement = select(func.count()).select_from(AuctionItem)

        if conditions:
            count_statement = count_statement.where(*conditions)

        total_result = await db.execute(count_statement)
        total = total_result.scalar_one()

        sort_column = SORT_COLUMN_MAP[filters.sort_by]
        order_clause = (
            sort_column.asc()
            if filters.sort_order == SortOrder.ASC
            else sort_column.desc()
        )

        statement = (
            select(
                AuctionItem,
                func.coalesce(bid_count_subquery.c.bid_count, 0).label(
                    "bid_count",
                ),
                primary_image_subquery.label("primary_image_url"),
            )
            .outerjoin(
                bid_count_subquery,
                AuctionItem.id == bid_count_subquery.c.item_id,
            )
            .options(
                selectinload(AuctionItem.seller),
                selectinload(AuctionItem.category),
                selectinload(AuctionItem.session).selectinload(
                    AuctionSession.rules,
                ),
            )
            .order_by(order_clause)
            .offset(offset)
            .limit(filters.page_size)
        )

        if conditions:
            statement = statement.where(*conditions)

        result = await db.execute(statement)

        rows = [
            (auction_item, int(bid_count), primary_image_url)
            for auction_item, bid_count, primary_image_url in result.all()
        ]

        return rows, total

    async def exists(
        self,
        db: AsyncSession,
        item_id: uuid.UUID,
    ) -> bool:
        statement = select(
            exists().where(AuctionItem.id == item_id),
        )

        result = await db.execute(statement)

        return bool(result.scalar())

    async def get_realtime_snapshot(
        self,
        db: AsyncSession,
        item_id: uuid.UUID,
    ) -> AuctionItemRealtimeSnapshot | None:
        statement = (
            select(
                AuctionItem.id,
                AuctionItem.status,
                AuctionItem.current_price,
                AuctionItem.starting_price,
                AuctionItem.opened_at,
                AuctionItem.closed_at,
                AuctionSessionRule.min_increment,
            )
            .join(
                AuctionSession,
                AuctionItem.session_id == AuctionSession.id,
            )
            .outerjoin(
                AuctionSessionRule,
                AuctionSessionRule.session_id == AuctionSession.id,
            )
            .where(AuctionItem.id == item_id)
        )

        result = await db.execute(statement)
        row = result.one_or_none()

        if row is None:
            return None

        (
            snapshot_item_id,
            status,
            current_price,
            starting_price,
            opened_at,
            closed_at,
            min_increment,
        ) = row

        return AuctionItemRealtimeSnapshot(
            item_id=snapshot_item_id,
            status=status.value,
            current_price=current_price,
            starting_price=starting_price,
            min_increment=(
                min_increment
                if min_increment is not None
                else Decimal("1.00")
            ),
            opened_at=opened_at,
            closed_at=closed_at,
        )

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

    async def find_by_id_with_session(
        self,
        db: AsyncSession,
        item_id: uuid.UUID,
    ) -> AuctionItem | None:
        statement = (
            select(AuctionItem)
            .options(
                selectinload(AuctionItem.session),
                selectinload(AuctionItem.images),
            )
            .where(AuctionItem.id == item_id)
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

    async def get_next_sort_order(
        self,
        db: AsyncSession,
        item_id: uuid.UUID,
    ) -> int:
        statement = select(func.max(ItemImage.sort_order)).where(
            ItemImage.item_id == item_id,
        )
        result = await db.execute(statement)
        current_max = result.scalar_one_or_none()

        return 0 if current_max is None else current_max + 1

    async def unset_primary_images(
        self,
        db: AsyncSession,
        item_id: uuid.UUID,
    ) -> None:
        statement = (
            update(ItemImage)
            .where(
                ItemImage.item_id == item_id,
                ItemImage.is_primary.is_(True),
            )
            .values(is_primary=False)
        )
        await db.execute(statement)

    async def create_image(
        self,
        db: AsyncSession,
        image: ItemImage,
    ) -> ItemImage:
        db.add(image)

        await db.flush()
        await db.refresh(image)

        return image