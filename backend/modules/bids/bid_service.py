import logging
import uuid

from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.use_cases.realtime.publish_bid_placed import (
    PublishBidPlacedUseCase,
)
from app.core.exceptions import AppException
from app.utils.datetime_utils import vietnam_now_naive
from app.models.bid_model import Bid
from app.models.user_model import User
from common.enum import (
    AuctionItemStatus,
    AuctionSessionStatus,
    BidStatus,
    MyBidOutcome,
)
from modules.auction_items.item_repository import AuctionItemRepository
from modules.auction_sessions.session_repository import AuctionSessionRepository
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
        session_repository: AuctionSessionRepository,
        notification_service: NotificationService,
        publish_bid_placed_use_case: PublishBidPlacedUseCase | None = None,
    ) -> None:
        self.bid_repository = bid_repository
        self.item_repository = item_repository
        self.session_repository = session_repository
        self.notification_service = notification_service
        self.publish_bid_placed_use_case = publish_bid_placed_use_case

    @staticmethod
    def _get_outcome(
        bids: list[Bid],
        bidder_id: uuid.UUID,
    ) -> MyBidOutcome | None:
        representative = bids[0]
        item = representative.item
        session = representative.session

        if (
            session.status
            in (
                AuctionSessionStatus.CANCELLED,
                AuctionSessionStatus.REJECTED,
            )
            or item.status == AuctionItemStatus.CANCELLED
        ):
            return None

        if (
            session.status == AuctionSessionStatus.ENDED
            or item.status
            in (
                AuctionItemStatus.SOLD,
                AuctionItemStatus.UNSOLD,
            )
        ):
            if (
                item.status == AuctionItemStatus.SOLD
                and item.winner_user_id == bidder_id
            ):
                return MyBidOutcome.WON

            return MyBidOutcome.LOST

        if any(bid.status == BidStatus.WINNING for bid in bids):
            return MyBidOutcome.LEADING

        return MyBidOutcome.OUTBID

    async def list_my_bids(
        self,
        db: AsyncSession,
        filters: MyBidListFilters,
    ) -> MyBidListData:
        changed_count = (
            await self.session_repository.synchronize_time_based_statuses(
                db=db,
                current_time=vietnam_now_naive(),
            )
        )

        if changed_count > 0:
            await db.commit()

        bids = await self.bid_repository.list_all_by_bidder(
            db=db,
            bidder_id=filters.bidder_id,
        )

        grouped_bids: dict[uuid.UUID, list[Bid]] = {}

        for bid in bids:
            if bid.status == BidStatus.CANCELLED:
                continue

            grouped_bids.setdefault(bid.item_id, []).append(bid)

        items: list[MyBidListItem] = []

        for item_bids in grouped_bids.values():
            item_bids.sort(
                key=lambda bid: bid.created_at,
                reverse=True,
            )
            latest_bid = item_bids[0]
            best_bid = max(
                item_bids,
                key=lambda bid: (bid.amount, bid.created_at),
            )
            outcome = self._get_outcome(
                bids=item_bids,
                bidder_id=filters.bidder_id,
            )

            if outcome is None:
                continue

            if (
                filters.outcome is not None
                and outcome != filters.outcome
            ):
                continue

            items.append(
                MyBidListItem(
                    id=latest_bid.id,
                    amount=best_bid.amount,
                    status=latest_bid.status,
                    outcome=outcome,
                    created_at=latest_bid.created_at,
                    item_id=latest_bid.item.id,
                    item_title=latest_bid.item.title,
                    item_status=latest_bid.item.status,
                    item_current_price=latest_bid.item.current_price,
                    item_final_price=latest_bid.item.final_price,
                    session_id=latest_bid.session.id,
                    session_title=latest_bid.session.title,
                    session_status=latest_bid.session.status,
                )
            )

        items.sort(
            key=lambda item: item.created_at,
            reverse=True,
        )

        total = len(items)
        offset = (filters.page - 1) * filters.page_size
        paginated_items = items[offset : offset + filters.page_size]

        return MyBidListData(
            items=paginated_items,
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

            current_time = vietnam_now_naive()

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