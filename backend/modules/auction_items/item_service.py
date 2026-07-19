import uuid

from fastapi import status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from common.enum import AuctionItemStatus, AuctionSessionStatus
from modules.auction_items.item_model import AuctionItem
from modules.auction_items.item_repository import AuctionItemRepository
from modules.auction_items.item_schema import CreateAuctionItemRequest
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
