import hashlib
import secrets
import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.password_reset_token_model import PasswordResetToken


def generate_raw_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


class PasswordResetTokenRepository:
    async def create(
        self,
        db: AsyncSession,
        user_id: uuid.UUID,
        raw_token: str,
        expires_at: datetime,
    ) -> PasswordResetToken:
        reset_token = PasswordResetToken(
            user_id=user_id,
            token_hash=hash_token(raw_token),
            expires_at=expires_at,
        )

        db.add(reset_token)
        await db.flush()
        await db.refresh(reset_token)

        return reset_token

    async def find_valid_by_raw_token(
        self,
        db: AsyncSession,
        raw_token: str,
    ) -> PasswordResetToken | None:
        statement = select(PasswordResetToken).where(
            PasswordResetToken.token_hash == hash_token(raw_token),
        )

        result = await db.execute(statement)

        return result.scalar_one_or_none()

    async def mark_as_used(
        self,
        db: AsyncSession,
        reset_token: PasswordResetToken,
    ) -> PasswordResetToken:
        reset_token.used_at = datetime.now()

        await db.flush()
        await db.refresh(reset_token)

        return reset_token