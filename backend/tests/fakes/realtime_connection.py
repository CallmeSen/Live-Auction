import asyncio
from uuid import UUID

from app.application.ports.realtime_connection import RealtimeConnection


class FakeRealtimeConnection:
    def __init__(
        self,
        *,
        send_raises: bool = False,
        fail_first_send: bool = False,
    ) -> None:
        self.accepted = False
        self.closed = False
        self.close_code: int | None = None
        self.sent_messages: list[dict] = []
        self.received_queue: asyncio.Queue[str] = asyncio.Queue()
        self._send_raises = send_raises
        self._fail_first_send = fail_first_send
        self._send_count = 0

    async def accept(self) -> None:
        self.accepted = True

    async def send_json(self, data: dict) -> None:
        self._send_count += 1

        if self._send_raises or (
            self._fail_first_send and self._send_count == 1
        ):
            raise ConnectionError("send failed")

        self.sent_messages.append(data)

    async def receive_text(self) -> str:
        return await self.received_queue.get()

    async def close(self, code: int = 1000) -> None:
        self.closed = True
        self.close_code = code


def assert_realtime_connection(
    connection: FakeRealtimeConnection,
) -> RealtimeConnection:
    return connection
