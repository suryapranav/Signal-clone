"""The real-time channel: one WebSocket per open client.

Server → client events
    ready                {user_id}
    message.new          {message}
    message.status       {updates: [{id, conversation_id, status}]}
    message.reactions    {conversation_id, message_id, reactions}
    message.deleted      {conversation_id, ids}            (disappearing messages)
    conversation.updated {conversation}
    conversation.read    {conversation_id}                 (read on another device)
    typing               {conversation_id, user_id, is_typing}
    presence             {user_id, online, last_seen_at}
    user.updated         {user}
    pong

Client → server events
    typing               {conversation_id, is_typing}
    read                 {conversation_id}
    ping

Writes (sending messages, group changes) go through REST so they get normal
HTTP validation and error responses. The socket is only for pushes and for
cheap, high-frequency signals like typing.
"""

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from ..database import SessionLocal, utcnow
from ..models import ConversationMember, User
from ..realtime import manager
from ..security import user_for_token
from ..services.messaging import mark_conversation_read, mark_delivered, publish_presence

log = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket, token: str = ""):
    with SessionLocal() as db:
        user = user_for_token(db, token)
    await ws.accept()
    if user is None:
        await ws.close(code=4401, reason="unauthorized")
        return

    came_online = manager.connect(user.id, ws)
    try:
        await ws.send_json({"type": "ready", "user_id": user.id})
        with SessionLocal() as db:
            if came_online:
                await publish_presence(db, user)
            # Anything sent while this user was offline is now delivered.
            await mark_delivered(db, user.id)

        while True:
            event = await ws.receive_json()
            # A fresh session per event avoids serving stale cached rows.
            with SessionLocal() as db:
                await _handle(db, user.id, event, ws)
    except WebSocketDisconnect:
        pass
    except Exception:
        log.exception("websocket error for user %s", user.id)
    finally:
        if manager.disconnect(user.id, ws):
            with SessionLocal() as db:
                db_user = db.get(User, user.id)
                if db_user is not None:
                    db_user.last_seen_at = utcnow()
                    db.commit()
                    await publish_presence(db, db_user)


def _active_member_ids(db, conv_id: int) -> list[int]:
    return list(
        db.scalars(
            select(ConversationMember.user_id).where(
                ConversationMember.conversation_id == conv_id,
                ConversationMember.left_at.is_(None),
            )
        )
    )


async def _handle(db, user_id: int, event: dict, ws: WebSocket) -> None:
    kind = event.get("type")
    if kind == "ping":
        await ws.send_json({"type": "pong"})
        return

    conv_id = event.get("conversation_id")
    if not isinstance(conv_id, int):
        return
    members = _active_member_ids(db, conv_id)
    if user_id not in members:
        return  # silently ignore events for chats the user isn't in

    if kind == "typing":
        await manager.send_to_users(
            (m for m in members if m != user_id),
            {
                "type": "typing",
                "conversation_id": conv_id,
                "user_id": user_id,
                "is_typing": bool(event.get("is_typing")),
            },
        )
    elif kind == "read":
        await mark_conversation_read(db, conv_id, user_id)
