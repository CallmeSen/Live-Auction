import json
import logging
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.use_cases.realtime.join_auction_item import (
    JoinAuctionItemUseCase,
)
from app.application.use_cases.realtime.leave_auction_item import (
    LeaveAuctionItemUseCase,
)
from app.application.use_cases.realtime.send_auction_chat_message import (
    SendAuctionChatMessageUseCase,
)
from app.core.database import get_db
from app.dependencies.realtime_dependencies import (
    get_join_auction_item_use_case,
    get_leave_auction_item_use_case,
    get_send_auction_chat_message_use_case,
)
from app.domain.events.websocket_error_event import create_websocket_error_event
from app.presentation.websocket.websocket_auth import resolve_websocket_user
from app.presentation.websocket.websocket_participant import (
    build_auction_realtime_participant,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Auction Item Realtime"])


async def _send_pong(websocket: WebSocket) -> None:
    await websocket.send_json({"type": "PONG"})


async def _handle_incoming_message(
    *,
    websocket: WebSocket,
    item_id: UUID,
    raw_message: dict[str, Any],
    send_chat_use_case: SendAuctionChatMessageUseCase,
    current_user,
) -> None:
    message_type = raw_message.get("type")

    if message_type == "PING":
        await _send_pong(websocket)
        return

    if message_type == "SEND_CHAT_MESSAGE":
        data = raw_message.get("data")

        if not isinstance(data, dict):
            await websocket.send_json(
                create_websocket_error_event(
                    code="INVALID_CHAT_MESSAGE",
                    message="Chat message payload is invalid.",
                ),
            )
            return

        content = data.get("content", "")

        if not isinstance(content, str):
            await websocket.send_json(
                create_websocket_error_event(
                    code="INVALID_CHAT_MESSAGE",
                    message="Chat message content must be a string.",
                ),
            )
            return

        result = await send_chat_use_case.execute(
            item_id=item_id,
            user=current_user,
            content=content,
        )

        if not result.ok:
            await websocket.send_json(
                create_websocket_error_event(
                    code=result.error_code or "INVALID_CHAT_MESSAGE",
                    message=result.error_message or "Unable to send chat message.",
                ),
            )

        return

    logger.debug(
        "Ignored unsupported WebSocket message type=%s item_id=%s",
        message_type,
        item_id,
    )


@router.websocket("/ws/auction-items/{item_id}")
async def auction_item_viewer_websocket(
    websocket: WebSocket,
    item_id: UUID,
    join_use_case: Annotated[
        JoinAuctionItemUseCase,
        Depends(get_join_auction_item_use_case),
    ],
    leave_use_case: Annotated[
        LeaveAuctionItemUseCase,
        Depends(get_leave_auction_item_use_case),
    ],
    send_chat_use_case: Annotated[
        SendAuctionChatMessageUseCase,
        Depends(get_send_auction_chat_message_use_case),
    ],
    db: Annotated[AsyncSession, Depends(get_db)],
    token: Annotated[str | None, Query()] = None,
    session_id: Annotated[str | None, Query(alias="sessionId")] = None,
) -> None:
    current_user = await resolve_websocket_user(token, db)

    participant = build_auction_realtime_participant(
        item_id=item_id,
        user=current_user,
        client_session_id=session_id,
    )

    join_result = await join_use_case.execute(
        item_id,
        websocket,
        participant,
    )

    if not join_result.accepted:
        return

    leave_executed = False

    async def leave_once() -> None:
        nonlocal leave_executed

        if leave_executed:
            return

        leave_executed = True
        await leave_use_case.execute(item_id, websocket)

    try:
        while True:
            incoming = await websocket.receive()

            if incoming.get("type") == "websocket.disconnect":
                break

            text = incoming.get("text")

            if text is None:
                continue

            if text == "ping":
                await websocket.send_text("PONG")
                continue

            try:
                raw_message = json.loads(text)
            except json.JSONDecodeError:
                await websocket.send_json(
                    create_websocket_error_event(
                        code="INVALID_MESSAGE",
                        message="WebSocket message must be valid JSON.",
                    ),
                )
                continue

            if not isinstance(raw_message, dict):
                await websocket.send_json(
                    create_websocket_error_event(
                        code="INVALID_MESSAGE",
                        message="WebSocket message must be a JSON object.",
                    ),
                )
                continue

            try:
                await _handle_incoming_message(
                    websocket=websocket,
                    item_id=item_id,
                    raw_message=raw_message,
                    send_chat_use_case=send_chat_use_case,
                    current_user=current_user,
                )
            except Exception:
                logger.exception(
                    "Failed to process WebSocket message item_id=%s",
                    item_id,
                )
                await websocket.send_json(
                    create_websocket_error_event(
                        code="INTERNAL_ERROR",
                        message="Unable to process WebSocket message.",
                    ),
                )
    except WebSocketDisconnect:
        logger.debug("WebSocket client disconnected item_id=%s", item_id)
    except Exception:
        logger.exception(
            "Unexpected WebSocket error item_id=%s",
            item_id,
        )
        raise
    finally:
        await leave_once()
