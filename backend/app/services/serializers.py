"""Turn ORM rows into API models.

Everything that depends on *who is looking* (message status, unread count, the
viewer's chat preferences) is computed here, in batched queries so that
rendering N conversations or messages costs a fixed number of SQL queries.
"""

from collections import defaultdict
from collections.abc import Sequence

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..database import utcnow
from ..models import (
    Conversation,
    ConversationMember,
    Message,
    MessageReceipt,
    Reaction,
    User,
)
from ..realtime import manager
from ..schemas import (
    ConversationOut,
    MemberOut,
    MessageOut,
    MessageStatus,
    ReactionOut,
    ReplyPreview,
    UserOut,
)


def user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        phone=user.phone,
        username=user.username,
        display_name=user.display_name,
        about=user.about,
        avatar_color=user.avatar_color,
        avatar_url=user.avatar_url,
        online=manager.is_online(user.id),
        last_seen_at=user.last_seen_at,
    )


# ---------- visibility ----------


def not_expired():
    return or_(Message.expires_at.is_(None), Message.expires_at > utcnow())


def visible_window():
    """SQL condition: message falls inside a membership's [joined_at, left_at]
    window. Requires ConversationMember to be joined to Message."""
    return and_(
        Message.conversation_id == ConversationMember.conversation_id,
        Message.created_at >= ConversationMember.joined_at,
        or_(ConversationMember.left_at.is_(None), Message.created_at <= ConversationMember.left_at),
        not_expired(),
    )


# ---------- messages ----------


def message_statuses(db: Session, message_ids: Sequence[int]) -> dict[int, MessageStatus]:
    """Aggregate receipts into one status per message.

    read      — every recipient has read it
    delivered — every recipient's device has received it
    sent      — stored on the server (or there are no recipients, e.g. Note to Self)
    """
    if not message_ids:
        return {}
    rows = db.execute(
        select(
            MessageReceipt.message_id,
            func.count(),
            func.count(MessageReceipt.delivered_at),
            func.count(MessageReceipt.read_at),
        )
        .where(MessageReceipt.message_id.in_(message_ids))
        .group_by(MessageReceipt.message_id)
    ).all()
    statuses: dict[int, MessageStatus] = {mid: "sent" for mid in message_ids}
    for mid, total, delivered, read in rows:
        if read == total:
            statuses[mid] = "read"
        elif delivered == total:
            statuses[mid] = "delivered"
    return statuses


def messages_out(db: Session, messages: Sequence[Message], viewer_id: int) -> list[MessageOut]:
    if not messages:
        return []
    ids = [m.id for m in messages]
    own_ids = [m.id for m in messages if m.sender_id == viewer_id and m.kind == "text"]
    statuses = message_statuses(db, own_ids)

    reactions: dict[int, list[ReactionOut]] = defaultdict(list)
    for r in db.scalars(
        select(Reaction).where(Reaction.message_id.in_(ids)).order_by(Reaction.created_at)
    ):
        reactions[r.message_id].append(ReactionOut(user_id=r.user_id, emoji=r.emoji))

    now = utcnow()
    out = []
    for m in messages:
        reply = m.reply_to
        if reply is not None and reply.expires_at is not None and reply.expires_at <= now:
            reply = None
        out.append(
            MessageOut(
                id=m.id,
                conversation_id=m.conversation_id,
                sender_id=m.sender_id,
                kind=m.kind,
                body=m.body,
                meta=m.meta,
                client_id=m.client_id,
                reply_to=ReplyPreview(id=reply.id, sender_id=reply.sender_id, body=reply.body)
                if reply
                else None,
                reactions=reactions.get(m.id, []),
                created_at=m.created_at,
                expires_at=m.expires_at,
                status=statuses.get(m.id),
            )
        )
    return out


def message_out(db: Session, message: Message, viewer_id: int) -> MessageOut:
    return messages_out(db, [message], viewer_id)[0]


# ---------- conversations ----------


def conversations_out(
    db: Session, memberships: Sequence[ConversationMember], viewer_id: int
) -> list[ConversationOut]:
    """Serialize the viewer's conversations (given as their membership rows)."""
    if not memberships:
        return []
    conv_ids = [m.conversation_id for m in memberships]

    convs = {
        c.id: c
        for c in db.scalars(
            select(Conversation)
            .where(Conversation.id.in_(conv_ids))
            .options(selectinload(Conversation.members).selectinload(ConversationMember.user))
        )
    }

    unread = dict(
        db.execute(
            select(Message.conversation_id, func.count())
            .join(MessageReceipt, MessageReceipt.message_id == Message.id)
            .where(
                MessageReceipt.user_id == viewer_id,
                MessageReceipt.read_at.is_(None),
                Message.conversation_id.in_(conv_ids),
                not_expired(),
            )
            .group_by(Message.conversation_id)
        ).all()
    )

    last_ids = dict(
        db.execute(
            select(Message.conversation_id, func.max(Message.id))
            .join(ConversationMember, visible_window())
            .where(ConversationMember.user_id == viewer_id, Message.conversation_id.in_(conv_ids))
            .group_by(Message.conversation_id)
        ).all()
    )
    last_msgs = db.scalars(
        select(Message)
        .where(Message.id.in_(list(last_ids.values())))
        .options(selectinload(Message.reply_to))
    ).all()
    last_by_conv = {
        m.conversation_id: out for m, out in zip(last_msgs, messages_out(db, last_msgs, viewer_id))
    }

    result = []
    for me in memberships:
        c = convs[me.conversation_id]
        result.append(
            ConversationOut(
                id=c.id,
                kind=c.kind,
                title=c.title,
                description=c.description,
                avatar_color=c.avatar_color,
                avatar_url=c.avatar_url,
                disappearing_seconds=c.disappearing_seconds,
                created_by=c.created_by,
                created_at=c.created_at,
                last_activity_at=c.last_activity_at,
                members=[
                    MemberOut(user=user_out(m.user), role=m.role, joined_at=m.joined_at)
                    for m in sorted(c.active_members, key=lambda m: m.joined_at)
                ],
                is_member=me.left_at is None,
                my_role=me.role,
                is_pinned=me.is_pinned,
                is_archived=me.is_archived,
                is_muted=me.is_muted,
                unread_count=unread.get(c.id, 0),
                last_message=last_by_conv.get(c.id),
            )
        )
    return result


def conversation_out(db: Session, membership: ConversationMember, viewer_id: int) -> ConversationOut:
    return conversations_out(db, [membership], viewer_id)[0]
