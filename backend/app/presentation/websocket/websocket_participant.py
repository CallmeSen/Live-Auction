from uuid import UUID, uuid4

from app.application.dto.auction_realtime_participant import (
    GUEST_DISPLAY_NAME,
    AuctionRealtimeParticipant,
)
from app.models.user_model import User


def build_auction_realtime_participant(
    *,
    item_id: UUID,
    user: User | None,
    client_session_id: str | None,
) -> AuctionRealtimeParticipant:
    return AuctionRealtimeParticipant(
        connection_id=uuid4(),
        item_id=item_id,
        user_id=user.id if user is not None else None,
        display_name=user.full_name if user is not None else GUEST_DISPLAY_NAME,
        client_session_id=client_session_id,
    )
