"""Creating messages and pushing real-time events.

Message lifecycle (as seen by the sender):

    sending   — client-only state until POST /messages returns
    sent      — stored; one receipt row per recipient created
    delivered — every recipient has an open socket that received it
                (immediately if online, otherwise when they next connect)
    read      — every recipient has opened the conversation

Every receipt change ends with `notify_status_changes`, which pushes the new
aggregate status to the original sender's devices.
"""

from collections import defaultdict
from collections.abc import Iterable, Sequence
from datetime import timedelta

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from ..database import utcnow
from ..models import Attachment, Contact, Conversation, ConversationMember, Message, MessageReceipt, User
from ..realtime import manager
from .serializers import conversation_out, message_out, message_statuses, not_expired, user_out


# ---------- writes ----------


def create_message(
    db: Session,
    conv: Conversation,
    sender_id: int,
    body: str,
    *,
    kind: str = "text",
    meta: dict | None = None,
    client_id: str | None = None,
    reply_to_id: int | None = None,
    attachment: Attachment | None = None,
) -> Message:
    if client_id:  # idempotent retry
        existing = db.scalar(
            select(Message).where(Message.sender_id == sender_id, Message.client_id == client_id)
        )
        if existing:
            return existing

    now = utcnow()
    ttl = conv.disappearing_seconds if kind == "text" else None
    msg = Message(
        conversation_id=conv.id,
        sender_id=sender_id,
        kind=kind,
        body=body,
        meta=meta,
        client_id=client_id,
        reply_to_id=reply_to_id,
        created_at=now,
        expires_at=now + timedelta(seconds=ttl) if ttl else None,
    )
    db.add(msg)
    db.flush()
    if attachment is not None:
        attachment.message_id = msg.id
    if kind == "text":  # system events don't need receipts or count as unread
        for m in conv.active_members:
            if m.user_id != sender_id:
                db.add(MessageReceipt(message_id=msg.id, user_id=m.user_id))
                if not m.is_muted:
                    m.is_archived = False  # a new message brings archived chats back
    conv.last_activity_at = now
    db.commit()
    return msg


def system_message(db: Session, conv: Conversation, actor: User, event: str, **meta) -> Message:
    return create_message(db, conv, actor.id, event, kind="system", meta=meta or None)


# ---------- receipts ----------


async def notify_status_changes(db: Session, message_ids: Sequence[int]) -> None:
    """Push the latest aggregate status of these messages to their senders."""
    if not message_ids:
        return
    statuses = message_statuses(db, message_ids)
    rows = db.execute(
        select(Message.id, Message.sender_id, Message.conversation_id).where(
            Message.id.in_(message_ids)
        )
    ).all()
    by_sender: dict[int, list[dict]] = defaultdict(list)
    for mid, sender_id, conv_id in rows:
        if sender_id is not None:
            by_sender[sender_id].append(
                {"id": mid, "conversation_id": conv_id, "status": statuses[mid]}
            )
    for sender_id, updates in by_sender.items():
        await manager.send_to_user(sender_id, {"type": "message.status", "updates": updates})


async def mark_delivered(db: Session, user_id: int, message_ids: Iterable[int] | None = None) -> None:
    """Mark receipts as delivered for `user_id` (all pending ones if no ids given)."""
    q = (
        select(MessageReceipt.message_id)
        .join(Message, Message.id == MessageReceipt.message_id)
        .where(MessageReceipt.user_id == user_id, MessageReceipt.delivered_at.is_(None), not_expired())
    )
    if message_ids is not None:
        q = q.where(MessageReceipt.message_id.in_(list(message_ids)))
    ids = db.scalars(q).all()
    if not ids:
        return
    db.execute(
        update(MessageReceipt)
        .where(MessageReceipt.user_id == user_id, MessageReceipt.message_id.in_(ids))
        .values(delivered_at=utcnow())
    )
    db.commit()
    await notify_status_changes(db, ids)


async def mark_conversation_read(db: Session, conv_id: int, user_id: int) -> int:
    ids = db.scalars(
        select(MessageReceipt.message_id)
        .join(Message, Message.id == MessageReceipt.message_id)
        .where(
            Message.conversation_id == conv_id,
            MessageReceipt.user_id == user_id,
            MessageReceipt.read_at.is_(None),
        )
    ).all()
    if ids:
        now = utcnow()
        db.execute(
            update(MessageReceipt)
            .where(MessageReceipt.user_id == user_id, MessageReceipt.message_id.in_(ids))
            .values(read_at=now, delivered_at=func.coalesce(MessageReceipt.delivered_at, now))
        )
        db.commit()
        await notify_status_changes(db, ids)
    # Clear the unread badge on the reader's other tabs/devices too.
    await manager.send_to_user(user_id, {"type": "conversation.read", "conversation_id": conv_id})
    return len(ids)


# ---------- fan-out ----------


async def publish_message(
    db: Session, msg: Message, conv: Conversation, also_notify: Iterable[int] = ()
) -> None:
    """Push a new message to every active member, then record deliveries.
    `also_notify` covers someone who was just removed from a group."""
    member_ids = {m.user_id for m in conv.active_members} | set(also_notify)
    recipients = [uid for uid in member_ids if uid != msg.sender_id]

    as_recipient = message_out(db, msg, viewer_id=-1).model_dump(mode="json")
    delivered = await manager.send_to_users(recipients, {"type": "message.new", "message": as_recipient})
    if msg.sender_id is not None:
        as_sender = message_out(db, msg, viewer_id=msg.sender_id).model_dump(mode="json")
        await manager.send_to_user(msg.sender_id, {"type": "message.new", "message": as_sender})

    if delivered and msg.kind == "text":
        db.execute(
            update(MessageReceipt)
            .where(MessageReceipt.message_id == msg.id, MessageReceipt.user_id.in_(delivered))
            .values(delivered_at=utcnow())
        )
        db.commit()
        await notify_status_changes(db, [msg.id])


async def publish_message_update(db: Session, msg: Message) -> None:
    """Push an edited or deleted message to everyone who can see it,
    including members who have since left (they keep read-only history)."""
    db.refresh(msg)
    members = set(
        db.scalars(select(ConversationMember.user_id).where(ConversationMember.conversation_id == msg.conversation_id))
    )
    others = [uid for uid in members if uid != msg.sender_id]
    as_recipient = message_out(db, msg, viewer_id=-1).model_dump(mode="json")
    await manager.send_to_users(others, {"type": "message.updated", "message": as_recipient})
    if msg.sender_id is not None:
        as_sender = message_out(db, msg, viewer_id=msg.sender_id).model_dump(mode="json")
        await manager.send_to_user(msg.sender_id, {"type": "message.updated", "message": as_sender})


async def publish_conversation(db: Session, conv: Conversation, also_notify: Iterable[int] = ()) -> None:
    """Send each member their own view of the conversation (unread count,
    role, etc. differ per viewer). `also_notify` covers users who were just
    removed, so their client can switch the chat to read-only."""
    db.refresh(conv)
    targets = {m.user_id for m in conv.active_members} | set(also_notify)
    for membership in conv.members:
        if membership.user_id in targets and manager.is_online(membership.user_id):
            view = conversation_out(db, membership, membership.user_id).model_dump(mode="json")
            await manager.send_to_user(
                membership.user_id, {"type": "conversation.updated", "conversation": view}
            )


def related_user_ids(db: Session, user_id: int) -> set[int]:
    """Everyone who should hear about this user's presence/profile changes:
    people sharing a conversation with them, and people who saved them as a contact."""
    my_convs = select(ConversationMember.conversation_id).where(
        ConversationMember.user_id == user_id
    )
    peers = set(
        db.scalars(
            select(ConversationMember.user_id).where(
                ConversationMember.conversation_id.in_(my_convs),
                ConversationMember.left_at.is_(None),
            )
        )
    )
    peers |= set(db.scalars(select(Contact.owner_id).where(Contact.contact_id == user_id)))
    peers.discard(user_id)
    return peers


async def publish_presence(db: Session, user: User) -> None:
    event = {
        "type": "presence",
        "user_id": user.id,
        "online": manager.is_online(user.id),
        "last_seen_at": user_out(user).model_dump(mode="json")["last_seen_at"],
    }
    await manager.send_to_users(related_user_ids(db, user.id), event)


async def publish_user(db: Session, user: User) -> None:
    event = {"type": "user.updated", "user": user_out(user).model_dump(mode="json")}
    await manager.send_to_users(related_user_ids(db, user.id), event)
    # The user's own devices also get their private settings.
    own = {"type": "user.updated", "user": user_out(user, is_self=True).model_dump(mode="json")}
    await manager.send_to_user(user.id, own)


# ---------- disappearing messages ----------


async def purge_expired(db: Session) -> int:
    rows = db.execute(
        select(Message.id, Message.conversation_id).where(Message.expires_at <= utcnow())
    ).all()
    if not rows:
        return 0
    by_conv: dict[int, list[int]] = defaultdict(list)
    for mid, conv_id in rows:
        by_conv[conv_id].append(mid)
    # Receipts and reactions go with the message (ON DELETE CASCADE);
    # replies keep existing with reply_to_id set to NULL.
    db.execute(delete(Message).where(Message.id.in_([mid for mid, _ in rows])))
    db.commit()
    for conv_id, ids in by_conv.items():
        members = db.scalars(
            select(ConversationMember.user_id).where(
                ConversationMember.conversation_id == conv_id
            )
        )
        await manager.send_to_users(
            members, {"type": "message.deleted", "conversation_id": conv_id, "ids": ids}
        )
    return len(rows)
