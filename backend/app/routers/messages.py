"""Message history, sending, and reactions."""

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..models import ConversationMember, Message, Reaction, User
from ..realtime import manager
from ..schemas import MessageCreateIn, MessageOut, MessagePage, ReactionIn
from ..security import current_user
from ..services import conversations as svc
from ..services.messaging import create_message, publish_message
from ..services.serializers import message_out, messages_out, visible_window

router = APIRouter(tags=["messages"])


@router.get("/conversations/{conv_id}/messages", response_model=MessagePage)
def list_messages(
    conv_id: int,
    before_id: int | None = Query(default=None, description="Load messages older than this id"),
    limit: int = Query(default=50, ge=1, le=200),
    me: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """A page of history, oldest first. Only messages inside the viewer's
    membership window are returned (joined late → no earlier history)."""
    svc.get_membership(db, conv_id, me.id)
    q = (
        select(Message)
        .join(ConversationMember, visible_window())
        .where(ConversationMember.user_id == me.id, Message.conversation_id == conv_id)
        .options(selectinload(Message.reply_to))
        .order_by(Message.id.desc())
        .limit(limit + 1)
    )
    if before_id is not None:
        q = q.where(Message.id < before_id)
    rows = db.scalars(q).all()
    page = list(reversed(rows[:limit]))
    return MessagePage(messages=messages_out(db, page, me.id), has_more=len(rows) > limit)


@router.post(
    "/conversations/{conv_id}/messages", response_model=MessageOut, status_code=status.HTTP_201_CREATED
)
async def send_message(
    conv_id: int, body: MessageCreateIn, me: User = Depends(current_user), db: Session = Depends(get_db)
):
    membership = svc.get_membership(db, conv_id, me.id)
    svc.require_active(membership)
    conv = membership.conversation
    if body.reply_to_id is not None:
        target = db.get(Message, body.reply_to_id)
        if target is None or target.conversation_id != conv_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Can't reply to that message")

    # Sending a message un-archives the chat for the sender, as in Signal.
    membership.is_archived = False
    msg = create_message(db, conv, me.id, body.body, client_id=body.client_id, reply_to_id=body.reply_to_id)
    await publish_message(db, msg, conv)
    return message_out(db, msg, me.id)


# ---------- reactions ----------


def _message_for_member(db: Session, message_id: int, user: User) -> Message:
    msg = db.get(Message, message_id)
    if msg is None or msg.kind != "text":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
    svc.require_active(svc.get_membership(db, msg.conversation_id, user.id))
    return msg


async def _publish_reactions(db: Session, msg: Message) -> None:
    reactions = [
        {"user_id": r.user_id, "emoji": r.emoji}
        for r in db.scalars(
            select(Reaction).where(Reaction.message_id == msg.id).order_by(Reaction.created_at)
        )
    ]
    members = db.scalars(
        select(ConversationMember.user_id).where(
            ConversationMember.conversation_id == msg.conversation_id,
            ConversationMember.left_at.is_(None),
        )
    )
    await manager.send_to_users(
        members,
        {
            "type": "message.reactions",
            "conversation_id": msg.conversation_id,
            "message_id": msg.id,
            "reactions": reactions,
        },
    )


@router.put("/messages/{message_id}/reaction", status_code=status.HTTP_204_NO_CONTENT)
async def set_reaction(
    message_id: int, body: ReactionIn, me: User = Depends(current_user), db: Session = Depends(get_db)
):
    msg = _message_for_member(db, message_id, me)
    reaction = db.get(Reaction, (msg.id, me.id))
    if reaction is None:
        db.add(Reaction(message_id=msg.id, user_id=me.id, emoji=body.emoji))
    else:
        reaction.emoji = body.emoji
    db.commit()
    await _publish_reactions(db, msg)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/messages/{message_id}/reaction", status_code=status.HTTP_204_NO_CONTENT)
async def remove_reaction(message_id: int, me: User = Depends(current_user), db: Session = Depends(get_db)):
    msg = _message_for_member(db, message_id, me)
    reaction = db.get(Reaction, (msg.id, me.id))
    if reaction is not None:
        db.delete(reaction)
        db.commit()
        await _publish_reactions(db, msg)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
