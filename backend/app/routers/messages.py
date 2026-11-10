"""Message history, sending, editing, deleting, and reactions."""

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db, utcnow
from ..models import Attachment, ConversationMember, Message, MessageReceipt, Reaction, User
from ..realtime import manager
from ..schemas import MessageCreateIn, MessageEditIn, MessageInfoOut, MessageOut, MessagePage, ReactionIn, ReceiptOut
from ..security import current_user
from ..services import conversations as svc
from ..services.messaging import create_message, publish_message, publish_message_update
from ..services.serializers import message_out, messages_out, receipts_on, user_out, visible_window

router = APIRouter(tags=["messages"])

# How long after sending you can still edit or delete a message for everyone.
CHANGE_WINDOW = timedelta(hours=24)


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
        if target is None or target.conversation_id != conv_id or target.deleted_at is not None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Can't reply to that message")

    attachment = None
    if body.attachment_id is not None:
        attachment = db.get(Attachment, body.attachment_id)
        # Only your own, not-yet-sent upload can be attached.
        if attachment is None or attachment.uploader_id != me.id or attachment.message_id is not None:
            existing = body.client_id and db.scalar(
                select(Message).where(Message.sender_id == me.id, Message.client_id == body.client_id)
            )
            if not existing:  # a retry of a send that already went through is fine
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid attachment")

    # Sending a message un-archives the chat for the sender, as in Signal.
    membership.is_archived = False
    msg = create_message(
        db, conv, me.id, body.body.strip(),
        client_id=body.client_id, reply_to_id=body.reply_to_id, attachment=attachment,
    )
    await publish_message(db, msg, conv)
    return message_out(db, msg, me.id)


@router.get("/messages/{message_id}/info", response_model=MessageInfoOut)
def message_info(message_id: int, me: User = Depends(current_user), db: Session = Depends(get_db)):
    """Per-recipient delivery and read times ("Message details" in the UI)."""
    msg = db.get(Message, message_id)
    if msg is None or msg.kind != "text":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
    svc.get_membership(db, msg.conversation_id, me.id)  # 404 unless you're (or were) in the chat
    q = (
        select(MessageReceipt, User)
        .join(User, User.id == MessageReceipt.user_id)
        .where(MessageReceipt.message_id == msg.id)
        .order_by(MessageReceipt.read_at.is_(None), MessageReceipt.read_at, User.display_name)
    )
    if msg.sender_id != me.id:
        q = q.where(MessageReceipt.user_id == me.id)
    # Read times follow the read-receipts setting of both the reader and the sender.
    sender_sees_reads = receipts_on(me.read_receipts) or msg.sender_id != me.id
    receipts = [
        ReceiptOut(
            user=user_out(u),
            delivered_at=r.delivered_at,
            read_at=r.read_at if (u.id == me.id or (sender_sees_reads and receipts_on(u.read_receipts))) else None,
        )
        for r, u in db.execute(q).all()
    ]
    return MessageInfoOut(message_id=msg.id, sent_at=msg.created_at, receipts=receipts)


# ---------- edit / delete for everyone ----------


def _own_changeable_message(db: Session, message_id: int, me: User, action: str) -> Message:
    msg = db.get(Message, message_id)
    if msg is None or msg.kind != "text":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
    svc.require_active(svc.get_membership(db, msg.conversation_id, me.id))
    if msg.sender_id != me.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"You can only {action} your own messages")
    if utcnow() - msg.created_at > CHANGE_WINDOW:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Messages can only be {action}ed within 24 hours")
    return msg


@router.patch("/messages/{message_id}", response_model=MessageOut)
async def edit_message(
    message_id: int, body: MessageEditIn, me: User = Depends(current_user), db: Session = Depends(get_db)
):
    """Replace the text of your own message. Everyone sees "Edited"."""
    msg = _own_changeable_message(db, message_id, me, "edit")
    if msg.deleted_at is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This message was deleted")
    text = body.body.strip()
    if not text and msg.attachment is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A message can't be empty")
    if text != msg.body:
        msg.body = text
        msg.edited_at = utcnow()
        db.commit()
        await publish_message_update(db, msg)
    return message_out(db, msg, me.id)


@router.delete("/messages/{message_id}", response_model=MessageOut)
async def delete_for_everyone(message_id: int, me: User = Depends(current_user), db: Session = Depends(get_db)):
    """Delete your own message for everyone. The row stays as a tombstone
    ("This message was deleted"); its text, file and reactions are removed."""
    msg = _own_changeable_message(db, message_id, me, "delete")
    if msg.deleted_at is None:  # deleting twice is harmless
        msg.deleted_at = utcnow()
        msg.body = ""
        if msg.attachment is not None:
            db.delete(msg.attachment)
        db.execute(delete(Reaction).where(Reaction.message_id == msg.id))
        db.commit()
        await publish_message_update(db, msg)
    return message_out(db, msg, me.id)


# ---------- reactions ----------


def _message_for_member(db: Session, message_id: int, user: User) -> Message:
    msg = db.get(Message, message_id)
    if msg is None or msg.kind != "text" or msg.deleted_at is not None:
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
