import uuid
from dataclasses import dataclass

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.session_model import AuctionSession
from common.enum import AuctionSessionStatus


@dataclass(frozen=True)
class SessionListFilters:
    page: int
    size: int
    status: AuctionSessionStatus | None
    keyword: str | None


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

    def _build_list_conditions(
        self,
        filters: SessionListFilters,
    ) -> list:
        conditions = []

        if filters.status is not None:
            conditions.append(AuctionSession.status == filters.status)

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
            .options(selectinload(AuctionSession.seller))
            .order_by(
                AuctionSession.start_time.asc(),
                AuctionSession.created_at.desc(),
            )
            .offset(offset)
            .limit(filters.size)
        )

        if conditions:
            statement = statement.where(*conditions)

        result = await db.execute(statement)

        return list(result.scalars().unique().all()), total

    async def create(
        self,
        db: AsyncSession,
        session: AuctionSession,
    ) -> AuctionSession:
        db.add(session)

        await db.flush()
        await db.refresh(session, attribute_names=["rules"])

        return session
