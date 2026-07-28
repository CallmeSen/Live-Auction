import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import case, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.item_model import AuctionItem
from app.models.session_model import AuctionSession
from common.enum import AuctionItemStatus, AuctionSessionStatus


@dataclass(frozen=True)
class SessionListFilters:
    page: int
    size: int
    status: AuctionSessionStatus | None
    keyword: str | None
    seller_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    excluded_statuses: tuple[AuctionSessionStatus, ...] = ()

class AuctionSessionRepository:
    async def find_by_id(
        self,
        db: AsyncSession,
        session_id: uuid.UUID,
    ) -> AuctionSession | None:
        statement = select(AuctionSession).where(
            AuctionSession.id == session_id,
        )

        result = await db.execute(statement)

        return result.scalar_one_or_none()

    async def find_detail_by_id(
        self,
        db: AsyncSession,
        session_id: uuid.UUID,
    ) -> AuctionSession | None:
        statement = (
            select(AuctionSession)
            .options(
                selectinload(AuctionSession.seller),
                selectinload(AuctionSession.rules),
                selectinload(AuctionSession.items).selectinload(
                    AuctionItem.images,
                ),
            )
            .where(AuctionSession.id == session_id)
        )

        result = await db.execute(statement)

        return result.scalar_one_or_none()

    async def find_by_id_for_update(
        self,
        db: AsyncSession,
        session_id: uuid.UUID,
    ) -> AuctionSession | None:
        statement = (
            select(AuctionSession)
            .options(
                selectinload(AuctionSession.rules),
                selectinload(AuctionSession.items),
            )
            .where(AuctionSession.id == session_id)
            .with_for_update()
        )

        result = await db.execute(statement)

        return result.scalar_one_or_none()

    def _build_list_conditions(
        self,
        filters: SessionListFilters,
    ) -> list:
        conditions = []

        if filters.status is not None:
            conditions.append(AuctionSession.status == filters.status)

        if filters.excluded_statuses:
            conditions.append(
                ~AuctionSession.status.in_(filters.excluded_statuses),
            )

        if filters.seller_id is not None:
            conditions.append(AuctionSession.seller_id == filters.seller_id)

        if filters.category_id is not None:
            conditions.append(
                AuctionSession.items.any(
                    AuctionItem.category_id == filters.category_id,
                ),
            )

        if filters.keyword:
            keyword_pattern = f"%{filters.keyword.lower()}%"
            conditions.append(
                or_(
                    func.lower(AuctionSession.title).like(keyword_pattern),
                    func.lower(AuctionSession.description).like(
                        keyword_pattern,
                    ),
                ),
            )

        return conditions

    async def list_sessions(
        self,
        db: AsyncSession,
        filters: SessionListFilters,
    ) -> tuple[list[AuctionSession], int]:
        conditions = self._build_list_conditions(filters)
        offset = (filters.page - 1) * filters.size

        count_statement = select(func.count()).select_from(AuctionSession)

        if conditions:
            count_statement = count_statement.where(*conditions)

        total_result = await db.execute(count_statement)
        total = total_result.scalar_one()

        statement = (
            select(AuctionSession)
            .options(
                selectinload(AuctionSession.seller),
                selectinload(AuctionSession.items).selectinload(
                    AuctionItem.images,
                ),
            )
            .order_by(
                case(
                    (AuctionSession.status == AuctionSessionStatus.ACTIVE, 0),
                    (
                        AuctionSession.status
                        == AuctionSessionStatus.SCHEDULED,
                        1,
                    ),
                    (
                        AuctionSession.status
                        == AuctionSessionStatus.PENDING_APPROVAL,
                        2,
                    ),
                    (AuctionSession.status == AuctionSessionStatus.ENDED, 3),
                    (
                        AuctionSession.status
                        == AuctionSessionStatus.REJECTED,
                        4,
                    ),
                    (
                        AuctionSession.status
                        == AuctionSessionStatus.CANCELLED,
                        5,
                    ),
                    else_=6,
                ).asc(),
                case(
                    (
                        AuctionSession.status
                        == AuctionSessionStatus.ACTIVE,
                        AuctionSession.end_time,
                    ),
                    (
                        AuctionSession.status
                        == AuctionSessionStatus.SCHEDULED,
                        AuctionSession.start_time,
                    ),
                    else_=None,
                ).asc(),
                case(
                    (
                        AuctionSession.status.in_(
                            (
                                AuctionSessionStatus.ENDED,
                                AuctionSessionStatus.REJECTED,
                                AuctionSessionStatus.CANCELLED,
                            ),
                        ),
                        AuctionSession.end_time,
                    ),
                    else_=None,
                ).desc(),
                AuctionSession.created_at.desc(),
            )
            .offset(offset)
            .limit(filters.size)
        )

        if conditions:
            statement = statement.where(*conditions)

        result = await db.execute(statement)

        return list(result.scalars().unique().all()), total

    async def synchronize_time_based_statuses(
        self,
        db: AsyncSession,
        current_time: datetime,
    ) -> int:
        expirable_statuses = (
            AuctionSessionStatus.PENDING_APPROVAL,
            AuctionSessionStatus.SCHEDULED,
            AuctionSessionStatus.ACTIVE,
        )

        expired_result = await db.execute(
            update(AuctionSession)
            .where(
                AuctionSession.status.in_(expirable_statuses),
                AuctionSession.end_time <= current_time,
            )
            .values(status=AuctionSessionStatus.ENDED),
        )

        future_active_session_ids = select(AuctionSession.id).where(
            AuctionSession.status == AuctionSessionStatus.ACTIVE,
            AuctionSession.start_time > current_time,
        )

        await db.execute(
            update(AuctionItem)
            .where(
                AuctionItem.session_id.in_(future_active_session_ids),
                AuctionItem.status == AuctionItemStatus.OPEN,
            )
            .values(
                status=AuctionItemStatus.READY,
                opened_at=None,
            ),
        )

        rescheduled_result = await db.execute(
            update(AuctionSession)
            .where(
                AuctionSession.status == AuctionSessionStatus.ACTIVE,
                AuctionSession.start_time > current_time,
            )
            .values(status=AuctionSessionStatus.SCHEDULED),
        )

        active_session_ids = select(AuctionSession.id).where(
            AuctionSession.status == AuctionSessionStatus.SCHEDULED,
            AuctionSession.start_time <= current_time,
            AuctionSession.end_time > current_time,
        )

        await db.execute(
            update(AuctionItem)
            .where(
                AuctionItem.session_id.in_(active_session_ids),
                AuctionItem.status == AuctionItemStatus.READY,
            )
            .values(
                status=AuctionItemStatus.OPEN,
                opened_at=current_time,
            ),
        )

        active_result = await db.execute(
            update(AuctionSession)
            .where(
                AuctionSession.status == AuctionSessionStatus.SCHEDULED,
                AuctionSession.start_time <= current_time,
                AuctionSession.end_time > current_time,
            )
            .values(status=AuctionSessionStatus.ACTIVE),
        )

        expired_count = max(
            getattr(expired_result, "rowcount", 0) or 0,
            0,
        )
        active_count = max(
            getattr(active_result, "rowcount", 0) or 0,
            0,
        )
        rescheduled_count = max(
            getattr(rescheduled_result, "rowcount", 0) or 0,
            0,
        )

        return expired_count + active_count + rescheduled_count

    async def create(
        self,
        db: AsyncSession,
        session: AuctionSession,
    ) -> AuctionSession:
        db.add(session)

        await db.flush()
        await db.refresh(session, attribute_names=["rules"])

        return session
