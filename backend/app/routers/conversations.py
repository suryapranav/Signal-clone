"""Chat list, direct chats, groups and group administration."""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AVATAR_COLORS, ConversationMember, User
from ..schemas import (
    ConversationOut,
    ConversationPrefsIn,
    ConversationUpdateIn,
    DirectCreateIn,
    GroupCreateIn,
    MemberRoleIn,
    MembersAddIn,
)
from ..security import current_user
from ..services import conversations as svc
from ..services.messaging import mark_conversation_read, publish_conversation, publish_message, system_message
from ..services.serializers import conversation_out, conversations_out

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("", response_model=list[ConversationOut])
def list_conversations(me: User = Depends(current_user), db: Session = Depends(get_db)):
    """All of the viewer's conversations, most recent activity first."""
    memberships = db.scalars(
        select(ConversationMember).where(ConversationMember.user_id == me.id)
    ).all()
    convs = conversations_out(db, memberships, me.id)
    return sorted(convs, key=lambda c: c.last_activity_at, reverse=True)


@router.get("/{conv_id}", response_model=ConversationOut)
def get_conversation(conv_id: int, me: User = Depends(current_user), db: Session = Depends(get_db)):
    return conversation_out(db, svc.get_membership(db, conv_id, me.id), me.id)


@router.post("/direct", response_model=ConversationOut)
def open_direct(body: DirectCreateIn, me: User = Depends(current_user), db: Session = Depends(get_db)):
    """Get the 1:1 chat with a user, creating it on first use."""
    other = db.get(User, body.user_id)
    if other is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    membership, _ = svc.get_or_create_direct(db, me, other)
    return conversation_out(db, membership, me.id)


@router.post("/group", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
async def create_group(body: GroupCreateIn, me: User = Depends(current_user), db: Session = Depends(get_db)):
    color = body.avatar_color if body.avatar_color in AVATAR_COLORS else "A140"
    conv = svc.create_group(db, me, body.title, body.member_ids, color, body.avatar_url)
    await publish_conversation(db, conv)
    return conversation_out(db, svc.get_membership(db, conv.id, me.id), me.id)


@router.patch("/{conv_id}", response_model=ConversationOut)
async def update_conversation(
    conv_id: int, body: ConversationUpdateIn, me: User = Depends(current_user), db: Session = Depends(get_db)
):
    membership = svc.get_membership(db, conv_id, me.id)
    conv = membership.conversation
    changes = body.model_dump(exclude_unset=True)

    group_fields = {"title", "description", "avatar_color", "avatar_url"} & changes.keys()
    if group_fields:
        if conv.kind != "group":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only groups have a name and photo")
        svc.require_admin(membership)
    if "disappearing_seconds" in changes:
        svc.require_admin(membership)  # in a 1:1 chat any member counts as admin

    if "title" in changes and changes["title"].strip() != conv.title:
        conv.title = changes["title"].strip()
        db.commit()
        await publish_message(db, system_message(db, conv, me, "title_changed", title=conv.title), conv)
    for field in ("description", "avatar_color", "avatar_url"):
        if field in changes:
            setattr(conv, field, changes[field] or (None if field == "avatar_url" else ""))
    if "disappearing_seconds" in changes:
        seconds = changes["disappearing_seconds"] or None
        if seconds != conv.disappearing_seconds:
            conv.disappearing_seconds = seconds
            db.commit()
            await publish_message(db, system_message(db, conv, me, "timer_changed", seconds=seconds), conv)
    db.commit()
    await publish_conversation(db, conv)
    return conversation_out(db, membership, me.id)


@router.patch("/{conv_id}/prefs", response_model=ConversationOut)
def update_prefs(
    conv_id: int, body: ConversationPrefsIn, me: User = Depends(current_user), db: Session = Depends(get_db)
):
    """The viewer's own pin / archive / mute settings for a chat."""
    membership = svc.get_membership(db, conv_id, me.id)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(membership, field, value)
    db.commit()
    return conversation_out(db, membership, me.id)


@router.post("/{conv_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_read(conv_id: int, me: User = Depends(current_user), db: Session = Depends(get_db)):
    svc.get_membership(db, conv_id, me.id)
    await mark_conversation_read(db, conv_id, me.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------- group membership ----------


def _group_membership(db: Session, conv_id: int, user_id: int) -> ConversationMember:
    membership = svc.get_membership(db, conv_id, user_id)
    if membership.conversation.kind != "group":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Not a group")
    return membership


@router.post("/{conv_id}/members", response_model=ConversationOut)
async def add_members(
    conv_id: int, body: MembersAddIn, me: User = Depends(current_user), db: Session = Depends(get_db)
):
    membership = _group_membership(db, conv_id, me.id)
    svc.require_admin(membership)
    conv = membership.conversation
    msg = svc.add_members(db, conv, me, body.user_ids)
    if msg is not None:
        await publish_message(db, msg, conv)
        await publish_conversation(db, conv)
    return conversation_out(db, membership, me.id)


@router.delete("/{conv_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    conv_id: int, user_id: int, me: User = Depends(current_user), db: Session = Depends(get_db)
):
    """Admins can remove anyone; any member can remove themselves (leave)."""
    membership = _group_membership(db, conv_id, me.id)
    if user_id == me.id:
        svc.require_active(membership)
        target = membership
    else:
        svc.require_admin(membership)
        target = svc.get_membership(db, conv_id, user_id)
        svc.require_active(target)
    conv = membership.conversation
    msg = svc.remove_member(db, conv, me, target)
    # The removed user must also get the system message and the update.
    await publish_message(db, msg, conv, also_notify=[target.user_id])
    await publish_conversation(db, conv, also_notify=[target.user_id])
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/{conv_id}/members/{user_id}", response_model=ConversationOut)
async def set_member_role(
    conv_id: int, user_id: int, body: MemberRoleIn, me: User = Depends(current_user), db: Session = Depends(get_db)
):
    membership = _group_membership(db, conv_id, me.id)
    svc.require_admin(membership)
    target = svc.get_membership(db, conv_id, user_id)
    svc.require_active(target)
    conv = membership.conversation
    if target.role != body.role:
        if body.role == "member" and sum(m.role == "admin" for m in conv.active_members) == 1:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "A group needs at least one admin")
        target.role = body.role
        db.commit()
        event = "admin_granted" if body.role == "admin" else "admin_revoked"
        msg = system_message(db, conv, me, event, user={"id": target.user_id, "name": target.user.display_name})
        await publish_message(db, msg, conv)
        await publish_conversation(db, conv)
    return conversation_out(db, membership, me.id)
