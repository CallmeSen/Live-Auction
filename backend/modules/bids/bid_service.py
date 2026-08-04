import logging
import uuid
from datetime import datetime

from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.use_cases.realtime.publish_bid_placed import (
    PublishBidPlacedUseCase,
)
from app.core.exceptions import AppException
from app.models.bid_model import Bid
from app.models.user_model import User
from common.enum import AuctionItemStatus, AuctionSessionStatus, BidStatus
from modules.auction_items.item_repository import AuctionItemRepository
from modules.bids.bid_repository import BidRepository, MyBidListFilters
from modules.bids.bid_schema import (
    MyBidListData,
    MyBidListItem,
    PlaceBidRequest,
)
from modules.notifications.notification_service import NotificationService

logger = logging.getLogger(__name__)


class BidService:
    def __init__(
        self,
        bid_repository: BidRepository,
        item_repository: AuctionItemRepository,
        notification_service: NotificationService,
        publish_bid_placed_use_case: PublishBidPlacedUseCase | None = None,
    ) -> None:
        self.bid_repository = bid_repository
        self.item_repository = item_repository
        self.notification_service = notification_service
        self.publish_bid_placed_use_case = publish_bid_placed_use_case

    async def list_my_bids(
        self,
        db: AsyncSession,
        filters: MyBidListFilters,
    ) -> MyBidListData:
        bids, total = await self.bid_repository.list_my_bids(
            db=db,
            filters=filters,
        )

        items = [
            MyBidListItem(
                id=bid.id,
                amount=bid.amount,
                status=bid.status,
                created_at=bid.created_at,
                item_id=bid.item.id,
                item_title=bid.item.title,
                item_status=bid.item.status,
                item_current_price=bid.item.current_price,
                session_id=bid.session.id,
                session_title=bid.session.title,
                session_status=bid.session.status,
            )
            for bid in bids
        ]

        return MyBidListData(
            items=items,
            page=filters.page,
            page_size=filters.page_size,
            total=total,
        )

    async def place_bid(
        self,
        db: AsyncSession,
        item_id: uuid.UUID,
        bidder: User,
        request: PlaceBidRequest,
    ) -> Bid:
        try:
            item = await self.item_repository.find_by_id_for_update(
                db=db,
                item_id=item_id,
            )

            if item is None:
                raise AppException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    code="AUCTION_ITEM_NOT_FOUND",
                    message="Auction item not found",
                )

            if item.status == AuctionItemStatus.SOLD:
                raise AppException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    code="ITEM_SOLD",
                    message="Auction item is sold",
                )

            session = item.session

            if session is None:
                raise AppException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    code="AUCTION_SESSION_NOT_FOUND",
                    message="Auction session not found",
                )

            # if session.status != AuctionSessionStatus.ACTIVE:
            #     raise AppException(
            #         status_code=status.HTTP_400_BAD_REQUEST,
            #         code="SESSION_NOT_ACTIVE",
            #         message="Auction session is not active",
            #     )

            current_time = datetime.now()

            if not (
                session.status == AuctionSessionStatus.ACTIVE
            ):
                raise AppException(
                   status_code=status.HTTP_400_BAD_REQUEST,
                    code="AUCTION_NOT_IN_PROGRESS",
                    message="Auction is not in progress",
                )

            if session.seller_id == bidder.id:
                raise AppException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    code="FORBIDDEN",
                    message="Session seller cannot place a bid",
                )

            rule = session.rules

            if rule is None:
                raise AppException(
                    status_code=status.HTTP_409_CONFLICT,
                    code="AUCTION_RULE_NOT_CONFIGURED",
                    message="Auction session rule is not configured",
                )

            winning_bid = await self.bid_repository.find_winning_by_item_id(
                db=db,
                item_id=item.id,
            )

            if winning_bid is None:
                minimum_bid = item.starting_price
            else:
                minimum_bid = item.current_price + rule.min_increment

            if request.amount < minimum_bid:
                raise AppException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    code="BID_TOO_LOW",
                    message="Bid amount is too low",
                    details={
                        "minimumBid": str(minimum_bid),
                    },
                )

            previous_bidder_id = None

            if winning_bid is not None:
                winning_bid.status = BidStatus.OUTBID
                previous_bidder_id = winning_bid.bidder_id

            new_bid = Bid(
                item_id=item.id,
                session_id=item.session_id,
                bidder_id=bidder.id,
                amount=request.amount,
                status=BidStatus.WINNING,
            )

            created_bid = await self.bid_repository.create(
                db=db,
                bid=new_bid,
            )

            item.current_price = request.amount

            # Tạo thông báo "bị trả giá cao hơn" cho người vừa mất vị trí
            # dẫn đầu, chỉ khi họ khác với người vừa đặt giá mới.
            if (
                previous_bidder_id is not None
                and previous_bidder_id != bidder.id
            ):
                await self.notification_service.notify_outbid(
                    db=db,
                    user_id=previous_bidder_id,
                    item_id=item.id,
                    item_title=item.title,
                )

            await db.commit()
            await db.refresh(created_bid)

            # Publish only after commit so a rollback never leaves clients
            # with a BID_PLACED event for an uncommitted bid.
            if self.publish_bid_placed_use_case is not None:
                try:
                    await self.publish_bid_placed_use_case.execute(
                        item_id=item.id,
                        bid_id=created_bid.id,
                        amount=created_bid.amount,
                        current_price=item.current_price,
                        placed_at=created_bid.created_at,
                        bidder_id=bidder.id,
                        bidder_name=bidder.full_name,
                    )
                except Exception:
                    logger.exception(
                        "Bid persisted but realtime publication failed item_id=%s bid_id=%s",
                        item.id,
                        created_bid.id,
                    )

            return created_bid

        except AppException:
            await db.rollback()
            raise

        except Exception:
            await db.rollback()
            raise