"""Conversation and membership rules (who may do what)."""

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import utcnow
from ..models import Conversation, ConversationMember, Message, User
from .messaging import system_message


def direct_key(a: int, b: int) -> str:
    lo, hi = sorted((a, b))
    return f"{lo}:{hi}"


def get_membership(db: Session, conv_id: int, user_id: int) -> ConversationMember:
    """The viewer's membership row (active or past). 404 if they were never a member."""
    membership = db.scalar(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conv_id,
            ConversationMember.user_id == user_id,
        )
    )
    if membership is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    return membership


def require_active(membership: ConversationMember) -> None:
    if membership.left_at is not None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You are no longer a member of this group")


def require_admin(membership: ConversationMember) -> None:
    require_active(membership)
    if membership.conversation.kind == "group" and membership.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only admins can do that")


def users_by_id(db: Session, ids: list[int]) -> list[User]:
    users = db.scalars(select(User).where(User.id.in_(set(ids)))).all()
    if len(users) != len(set(ids)):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "One or more users don't exist")
    return list(users)


def get_or_create_direct(db: Session, me: User, other: User) -> tuple[ConversationMember, bool]:
    key = direct_key(me.id, other.id)
    conv = db.scalar(select(Conversation).where(Conversation.direct_key == key))
    created = conv is None
    if created:
        conv = Conversation(kind="direct", direct_key=key, created_by=me.id)
        conv.members = [ConversationMember(user_id=uid) for uid in {me.id, other.id}]
        db.add(conv)
        db.commit()
    return get_membership(db, conv.id, me.id), created


def create_group(
    db: Session, creator: User, title: str, member_ids: list[int], avatar_color: str, avatar_url: str | None
) -> Conversation:
    members = [u for u in users_by_id(db, member_ids) if u.id != creator.id]
    conv = Conversation(
        kind="group", title=title.strip(), created_by=creator.id,
        avatar_color=avatar_color, avatar_url=avatar_url,
    )
    now = utcnow()
    conv.members = [ConversationMember(user_id=creator.id, role="admin", joined_at=now)] + [
        ConversationMember(user_id=u.id, role="member", joined_at=now) for u in members
    ]
    db.add(conv)
    db.commit()
    system_message(db, conv, creator, "group_created", title=conv.title)
    return conv


def add_members(db: Session, conv: Conversation, actor: User, user_ids: list[int]) -> Message | None:
    """Add (or re-add) users. Returns the "members_added" system message, or
    None if everyone was already in the group."""
    existing = {m.user_id: m for m in conv.members}
    added: list[User] = []
    now = utcnow()
    for user in users_by_id(db, user_ids):
        row = existing.get(user.id)
        if row is not None and row.left_at is None:
            continue  # already in the group
        if row is None:
            conv.members.append(ConversationMember(user_id=user.id, joined_at=now))
        else:  # re-joining: new visibility window starts now
            row.left_at, row.joined_at, row.role = None, now, "member"
        added.append(user)
    db.commit()
    if not added:
        return None
    return system_message(
        db, conv, actor, "members_added",
        users=[{"id": u.id, "name": u.display_name} for u in added],
    )


def remove_member(db: Session, conv: Conversation, actor: User, target: ConversationMember) -> Message:
    """Admin removes someone, or a member leaves (actor == target).

    The system message is written *before* closing the membership window, so
    the removed person still sees "X removed you" as their last message."""
    if actor.id == target.user_id:
        msg = system_message(db, conv, actor, "member_left")
    else:
        msg = system_message(
            db, conv, actor, "member_removed",
            user={"id": target.user_id, "name": target.user.display_name},
        )
    target.left_at = utcnow()
    target.is_pinned = False
    if target.role == "admin":
        target.role = "member"
        remaining = sorted(conv.active_members, key=lambda m: m.joined_at)
        if remaining and not any(m.role == "admin" for m in remaining):
            remaining[0].role = "admin"  # a group always keeps at least one admin
    db.commit()
    return msg
