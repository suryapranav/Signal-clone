"""Request and response models (the API contract)."""

import re
from datetime import datetime, timezone
from typing import Annotated, Literal

from pydantic import BaseModel, Field, PlainSerializer, field_validator, model_validator

from .models import AVATAR_COLORS

# Datetimes are stored as naive UTC; send them as ISO-8601 with a 'Z'.
UTCDateTime = Annotated[
    datetime,
    PlainSerializer(
        lambda d: d.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z"),
        return_type=str,
    ),
]

PHONE_RE = re.compile(r"^\+[1-9]\d{7,14}$")  # E.164
USERNAME_RE = re.compile(r"^[a-z][a-z0-9_]{2,26}\.\d{2,9}$")  # Signal style: name.42


def normalize_phone(raw: str) -> str:
    phone = re.sub(r"[\s\-().]", "", raw)
    if not PHONE_RE.match(phone):
        raise ValueError("Enter a valid phone number with country code, e.g. +15550100001")
    return phone


# ---------- users & auth ----------


class UserOut(BaseModel):
    id: int
    phone: str
    username: str | None
    display_name: str
    about: str
    avatar_color: str
    avatar_url: str | None
    online: bool
    last_seen_at: UTCDateTime | None
    # Your own privacy settings; only included when the user is you.
    read_receipts: bool | None = None


class PhoneIn(BaseModel):
    phone: str

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        return normalize_phone(v)


class OtpRequestIn(PhoneIn):
    pass


class OtpRequestOut(BaseModel):
    phone: str
    registered: bool
    otp_hint: str  # mocked verification: the code is shown to the user


class VerifyOtpIn(PhoneIn):
    code: str = Field(min_length=4, max_length=8)


class AuthOut(BaseModel):
    token: str
    user: UserOut
    needs_profile: bool


class ProfileUpdateIn(BaseModel):
    display_name: str | None = Field(default=None, max_length=64)
    about: str | None = Field(default=None, max_length=140)
    avatar_color: str | None = None
    avatar_url: str | None = None  # data URL; "" removes the photo
    username: str | None = None  # "" removes the username
    read_receipts: bool | None = None

    @field_validator("display_name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        if v is not None and not v.strip():
            raise ValueError("Name can't be empty")
        return v.strip() if v else v

    @field_validator("avatar_color")
    @classmethod
    def _color(cls, v: str | None) -> str | None:
        if v is not None and v not in AVATAR_COLORS:
            raise ValueError("Unknown avatar color")
        return v

    @field_validator("avatar_url")
    @classmethod
    def _avatar(cls, v: str | None) -> str | None:
        if v and not v.startswith("data:image/"):
            raise ValueError("Avatar must be an image data URL")
        return v

    @field_validator("username")
    @classmethod
    def _username(cls, v: str | None) -> str | None:
        if v:
            v = v.strip().lower()
            if not USERNAME_RE.match(v):
                raise ValueError("Usernames look like name.42 (letters, then a dot and 2+ digits)")
        return v


# ---------- contacts ----------


class ContactOut(BaseModel):
    user: UserOut
    nickname: str | None
    created_at: UTCDateTime


class ContactCreateIn(BaseModel):
    query: str = Field(description="Phone number (E.164) or username")
    nickname: str | None = Field(default=None, max_length=64)


# ---------- messages ----------

MessageStatus = Literal["sent", "delivered", "read"]


class AttachmentOut(BaseModel):
    id: int
    url: str  # relative to the API origin
    filename: str
    content_type: str
    size: int
    width: int | None
    height: int | None
    is_image: bool


class ReplyPreview(BaseModel):
    id: int
    sender_id: int | None
    body: str
    attachment: AttachmentOut | None
    deleted: bool = False


class ReactionOut(BaseModel):
    user_id: int
    emoji: str


class MessageOut(BaseModel):
    id: int
    conversation_id: int
    sender_id: int | None
    kind: Literal["text", "system"]
    body: str
    meta: dict | None
    client_id: str | None
    reply_to: ReplyPreview | None
    attachment: AttachmentOut | None
    reactions: list[ReactionOut]
    created_at: UTCDateTime
    expires_at: UTCDateTime | None
    edited_at: UTCDateTime | None = None
    deleted_at: UTCDateTime | None = None
    # Only present on the viewer's own messages.
    status: MessageStatus | None


class MessageEditIn(BaseModel):
    body: str = Field(max_length=4000)


class MessageCreateIn(BaseModel):
    body: str = Field(default="", max_length=4000)
    client_id: str | None = Field(default=None, max_length=64)
    reply_to_id: int | None = None
    attachment_id: int | None = None

    @model_validator(mode="after")
    def _not_empty(self) -> "MessageCreateIn":
        if not self.body.strip() and self.attachment_id is None:
            raise ValueError("Message can't be empty")
        return self


class MessagePage(BaseModel):
    messages: list[MessageOut]  # oldest first
    has_more: bool


class ReceiptOut(BaseModel):
    user: UserOut
    delivered_at: UTCDateTime | None
    read_at: UTCDateTime | None


class MessageInfoOut(BaseModel):
    message_id: int
    sent_at: UTCDateTime
    # The sender sees every recipient; anyone else sees only their own receipt.
    receipts: list[ReceiptOut]


class ReactionIn(BaseModel):
    emoji: str = Field(min_length=1, max_length=16)


# ---------- conversations ----------


class MemberOut(BaseModel):
    user: UserOut
    role: Literal["admin", "member"]
    joined_at: UTCDateTime


class ConversationOut(BaseModel):
    id: int
    kind: Literal["direct", "group"]
    title: str | None
    description: str
    avatar_color: str
    avatar_url: str | None
    disappearing_seconds: int | None
    created_by: int | None
    created_at: UTCDateTime
    last_activity_at: UTCDateTime
    members: list[MemberOut]  # active members only
    # Viewer-specific
    is_member: bool
    my_role: Literal["admin", "member"]
    is_pinned: bool
    is_archived: bool
    is_muted: bool
    unread_count: int
    last_message: MessageOut | None


class DirectCreateIn(BaseModel):
    user_id: int


class GroupCreateIn(BaseModel):
    title: str = Field(min_length=1, max_length=64)
    member_ids: list[int] = Field(min_length=1)
    avatar_color: str | None = None
    avatar_url: str | None = None


class ConversationUpdateIn(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=64)
    description: str | None = Field(default=None, max_length=480)
    avatar_color: str | None = None
    avatar_url: str | None = None
    # 0 turns disappearing messages off
    disappearing_seconds: int | None = Field(default=None, ge=0, le=60 * 60 * 24 * 28)


class ConversationPrefsIn(BaseModel):
    is_pinned: bool | None = None
    is_archived: bool | None = None
    is_muted: bool | None = None


class MembersAddIn(BaseModel):
    user_ids: list[int] = Field(min_length=1)


class MemberRoleIn(BaseModel):
    role: Literal["admin", "member"]
