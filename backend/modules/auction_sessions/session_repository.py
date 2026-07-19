import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.session_model import AuctionSession


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

    async def create(
        self,
        db: AsyncSession,
        session: AuctionSession,
    ) -> AuctionSession:
        db.add(session)

        await db.flush()
        await db.refresh(session, attribute_names=["rules"])

        return session
