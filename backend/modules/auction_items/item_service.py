import math
import uuid

from fastapi import status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from common.enum import AuctionItemStatus, AuctionSessionStatus
from app.models.item_model import AuctionItem
from modules.auction_items.item_repository import (
    AuctionItemRepository,
    ItemListFilters,
)
from modules.auction_items.item_schema import (
    AuctionItemBidData,
    AuctionItemDetailData,
    AuctionItemImageData,
    AuctionItemListCategoryData,
    AuctionItemListData,
    AuctionItemListItem,
    AuctionItemListSessionData,
    AuctionItemSellerData,
    AuctionItemSessionData,
    CreateAuctionItemRequest,
)
from modules.auction_sessions.session_repository import (
    AuctionSessionRepository,
)
from modules.categories.category_repository import CategoryRepository


class AuctionItemService:
    def __init__(
        self,
        item_repository: AuctionItemRepository,
        session_repository: AuctionSessionRepository,
        category_repository: CategoryRepository,
    ) -> None:
        self.item_repository = item_repository
        self.session_repository = session_repository
        self.category_repository = category_repository

    async def list_items(
        self,
        db: AsyncSession,
        filters: ItemListFilters,
    ) -> AuctionItemListData:
        rows, total = await self.item_repository.list_items(
            db=db,
            filters=filters,
        )

        items = [
            self._map_list_item(
                auction_item,
                bid_count,
                primary_image_url,
            )
            for auction_item, bid_count, primary_image_url in rows
        ]

        total_pages = (
            math.ceil(total / filters.page_size) if total > 0 else 0
        )

        return AuctionItemListData(
            items=items,
            page=filters.page,
            page_size=filters.page_size,
            total=total,
            total_pages=total_pages,
        )

    def _map_list_item(
        self,
        item: AuctionItem,
        bid_count: int,
        primary_image_url: str | None,
    ) -> AuctionItemListItem:
        if item.session.rules is None:
            raise AppException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                code="SESSION_RULE_NOT_FOUND",
                message="Auction session rule not found",
            )

        category = None

        if item.category is not None:
            category = AuctionItemListCategoryData(
                id=item.category.id,
                name=item.category.name,
                slug=item.category.slug,
            )

        return AuctionItemListItem(
            id=item.id,
            title=item.title,
            description=item.description,
            starting_price=item.starting_price,
            current_price=item.current_price,
            final_price=item.final_price,
            status=item.status,
            opened_at=item.opened_at,
            closed_at=item.closed_at,
            created_at=item.created_at,
            primary_image_url=primary_image_url,
            bid_count=bid_count,
            seller=AuctionItemSellerData(
                id=item.seller.id,
                full_name=item.seller.full_name,
            ),
            category=category,
            session=AuctionItemListSessionData(
                id=item.session.id,
                title=item.session.title,
                status=item.session.status,
                start_time=item.session.start_time,
                end_time=item.session.end_time,
                min_increment=item.session.rules.min_increment,
            ),
        )

    async def get_item_detail(
        self,
        db: AsyncSession,
        item_id: uuid.UUID,
    ) -> AuctionItemDetailData:
        item = await self.item_repository.find_detail_by_id(
            db=db,
            item_id=item_id,
        )

        if item is None:
            raise AppException(
                status_code=status.HTTP_404_NOT_FOUND,
                code="ITEM_NOT_FOUND",
                message="Auction item not found",
            )

        if item.session.rules is None:
            raise AppException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                code="SESSION_RULE_NOT_FOUND",
                message="Auction session rule not found",
            )

        sorted_bids = sorted(
            item.bids,
            key=lambda bid: bid.created_at,
            reverse=True,
        )

        return AuctionItemDetailData(
            id=item.id,
            session_id=item.session_id,
            title=item.title,
            description=item.description,
            starting_price=item.starting_price,
            current_price=item.current_price,
            status=item.status,
            seller=AuctionItemSellerData(
                id=item.seller.id,
                full_name=item.seller.full_name,
            ),
            session=AuctionItemSessionData(
                id=item.session.id,
                title=item.session.title,
                status=item.session.status,
                end_time=item.session.end_time,
                min_increment=item.session.rules.min_increment,
            ),
            images=[
                AuctionItemImageData(
                    image_url=image.image_url,
                    is_primary=image.is_primary,
                )
                for image in item.images
            ],
            bids=[
                AuctionItemBidData(
                    id=bid.id,
                    bidder_name=bid.bidder.full_name,
                    amount=bid.amount,
                    status=bid.status,
                    created_at=bid.created_at,
                )
                for bid in sorted_bids
            ],
        )

    async def create_item(
        self,
        db: AsyncSession,
        session_id: uuid.UUID,
        seller_id: uuid.UUID,
        request: CreateAuctionItemRequest,
    ) -> AuctionItem:
        session = await self.session_repository.find_by_id(
            db=db,
            session_id=session_id,
        )

        if session is None:
            raise AppException(
                status_code=status.HTTP_404_NOT_FOUND,
                code="SESSION_NOT_FOUND",
                message="Auction session not found",
            )

        if session.seller_id != seller_id:
            raise AppException(
                status_code=status.HTTP_403_FORBIDDEN,
                code="FORBIDDEN",
                message="You are not the owner of this auction session",
            )

        if session.status != AuctionSessionStatus.SCHEDULED:
            raise AppException(
                status_code=status.HTTP_400_BAD_REQUEST,
                code="SESSION_NOT_SCHEDULED",
                message="Items can only be added to a scheduled auction session",
            )

        if request.category_id is not None:
            category = await self.category_repository.find_by_id(
                db=db,
                category_id=request.category_id,
            )

            if category is None:
                raise AppException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    code="CATEGORY_NOT_FOUND",
                    message="Category not found",
                )

        item = AuctionItem(
            seller_id=seller_id,
            session_id=session_id,
            category_id=request.category_id,
            title=request.title,
            description=request.description,
            starting_price=request.starting_price,
            current_price=request.starting_price,
            status=AuctionItemStatus.UNSOLD,
        )

        try:
            created_item = await self.item_repository.create(
                db=db,
                item=item,
            )
            await db.commit()

            return created_item

        except IntegrityError as exception:
            await db.rollback()

            raise AppException(
                status_code=status.HTTP_400_BAD_REQUEST,
                code="CREATE_ITEM_FAILED",
                message="Unable to create auction item",
            ) from exception

        except Exception:
            await db.rollback()
            raise
