import uuid

from app.application.dto.auction_realtime_participant import (
    AuctionRealtimeParticipant,
    GUEST_DISPLAY_NAME,
)


def build_test_participant(
    item_id: uuid.UUID,
    *,
    display_name: str = "Nguyen Van A",
    user_id: uuid.UUID | None = None,
    client_session_id: str | None = None,
) -> AuctionRealtimeParticipant:
    return AuctionRealtimeParticipant(
        connection_id=uuid.uuid4(),
        item_id=item_id,
        user_id=user_id,
        display_name=display_name,
        client_session_id=client_session_id,
    )


def build_guest_participant(
    item_id: uuid.UUID,
    *,
    client_session_id: str | None = None,
) -> AuctionRealtimeParticipant:
    return build_test_participant(
        item_id,
        display_name=GUEST_DISPLAY_NAME,
        user_id=None,
        client_session_id=client_session_id,
    )
