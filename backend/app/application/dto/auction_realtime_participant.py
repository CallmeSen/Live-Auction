from dataclasses import dataclass
from uuid import UUID

GUEST_DISPLAY_NAME = "A guest"


@dataclass(frozen=True)
class AuctionRealtimeParticipant:
    connection_id: UUID
    item_id: UUID
    user_id: UUID | None
    display_name: str
    client_session_id: str | None


@dataclass(frozen=True)
class ConnectParticipantResult:
    is_reconnect: bool


@dataclass(frozen=True)
class DisconnectParticipantResult:
    participant: AuctionRealtimeParticipant
    should_publish_leave: bool
