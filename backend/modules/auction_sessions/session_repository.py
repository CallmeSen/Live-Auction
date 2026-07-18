from sqlalchemy.ext.asyncio import AsyncSession

from modules.auction_sessions.session_model import AuctionSession


class AuctionSessionRepository:
    async def create(
        self,
        db: AsyncSession,
        session: AuctionSession,
    ) -> AuctionSession:
        db.add(session)

        await db.flush()
        await db.refresh(session, attribute_names=["rules"])

        return session
