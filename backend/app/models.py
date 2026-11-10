"""Database schema.

    users ──< auth_sessions
    users ──< contacts >── users                (owner → contact)
    users ──< conversation_members >── conversations
    conversations ──< messages >── users        (sender)
    messages ──< message_receipts >── users     (one row per recipient)
    messages ──< reactions >── users
    messages ──? messages                       (reply_to)
    messages ──? attachments >── users          (uploader)

Design notes
- Direct chats and groups share one `conversations` table (kind = direct|group)
  so messages, receipts and the chat list work identically for both.
- `conversations.direct_key` ("<low_id>:<high_id>") is UNIQUE, which guarantees
  at most one direct chat per pair of users. "Note to Self" is "<id>:<id>".
- Removing someone from a group sets `left_at` instead of deleting the row, so
  they keep read-only access to history up to that moment.
- Attachments are uploaded first (message_id NULL), then linked when the
  message is sent. Bytes live in a deferred BLOB column, so listing messages
  never loads file contents; files are served by an unguessable random key.
- Message status (sent / delivered / read) is never stored on the message; it is
  derived from `message_receipts`, which makes groups work the same as 1:1.
  Unread counts are derived from the same table (receipts with read_at NULL).
"""

from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, deferred, mapped_column, relationship

from .database import Base, utcnow

AVATAR_COLORS = (
    "A100", "A110", "A120", "A130", "A140", "A150",
    "A160", "A170", "A180", "A190", "A200", "A210",
)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    phone: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    username: Mapped[str | None] = mapped_column(String(32), unique=True)
    display_name: Mapped[str] = mapped_column(String(64), default="")
    about: Mapped[str] = mapped_column(String(140), default="")
    avatar_color: Mapped[str] = mapped_column(String(8), default="A110")
    avatar_url: Mapped[str | None] = mapped_column(Text)  # data URL
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime)
    # Privacy setting. When off, nobody sees "read" on messages this user
    # receives, and this user doesn't see it on messages they send (as in
    # Signal). NULL, for rows created before the setting existed, means on.
    read_receipts: Mapped[bool | None] = mapped_column(Boolean, default=True)

    sessions: Mapped[list["AuthSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class AuthSession(Base):
    """A logged-in device. Only the SHA-256 of the bearer token is stored."""

    __tablename__ = "auth_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)

    user: Mapped[User] = relationship(back_populates="sessions")


class Contact(Base):
    __tablename__ = "contacts"
    __table_args__ = (
        UniqueConstraint("owner_id", "contact_id"),
        CheckConstraint("owner_id <> contact_id", name="no_self_contact"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    contact_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    nickname: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    contact: Mapped[User] = relationship(foreign_keys=[contact_id])


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (
        CheckConstraint("kind IN ('direct', 'group')", name="conversation_kind"),
        CheckConstraint(
            "(kind = 'direct') = (direct_key IS NOT NULL)", name="direct_key_iff_direct"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(8))
    direct_key: Mapped[str | None] = mapped_column(String(32), unique=True)
    title: Mapped[str | None] = mapped_column(String(64))  # groups only
    description: Mapped[str] = mapped_column(String(480), default="")
    avatar_color: Mapped[str] = mapped_column(String(8), default="A110")
    avatar_url: Mapped[str | None] = mapped_column(Text)
    disappearing_seconds: Mapped[int | None] = mapped_column(Integer)
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    # Bumped on every message; the chat list is sorted by it.
    last_activity_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    members: Mapped[list["ConversationMember"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan"
    )

    @property
    def active_members(self) -> list["ConversationMember"]:
        return [m for m in self.members if m.left_at is None]


class ConversationMember(Base):
    __tablename__ = "conversation_members"
    __table_args__ = (
        UniqueConstraint("conversation_id", "user_id"),
        CheckConstraint("role IN ('admin', 'member')", name="member_role"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE")
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[str] = mapped_column(String(8), default="member")
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    left_at: Mapped[datetime | None] = mapped_column(DateTime)  # NULL = active

    # Per-user chat preferences
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    is_muted: Mapped[bool] = mapped_column(Boolean, default=False)

    conversation: Mapped[Conversation] = relationship(back_populates="members")
    user: Mapped[User] = relationship()


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (
        CheckConstraint("kind IN ('text', 'system')", name="message_kind"),
        # Lets the client retry a send safely: same client_id → same message.
        UniqueConstraint("sender_id", "client_id"),
        Index("ix_messages_conversation_id_id", "conversation_id", "id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE")
    )
    sender_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    kind: Mapped[str] = mapped_column(String(8), default="text")
    # For text messages: the text. For system messages: an event key such as
    # "group_created" or "members_added", with details in `meta`.
    body: Mapped[str] = mapped_column(Text)
    meta: Mapped[dict | None] = mapped_column(JSON)
    reply_to_id: Mapped[int | None] = mapped_column(
        ForeignKey("messages.id", ondelete="SET NULL")
    )
    client_id: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    # Set when the sender edits the text (the body holds the latest version).
    edited_at: Mapped[datetime | None] = mapped_column(DateTime)
    # "Delete for everyone": the row stays as a tombstone so the chat shows
    # "This message was deleted", but its text, file and reactions are removed.
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime)

    reply_to: Mapped["Message | None"] = relationship(remote_side=[id])
    attachment: Mapped["Attachment | None"] = relationship(
        back_populates="message", uselist=False, lazy="selectin", passive_deletes=True
    )


class Attachment(Base):
    """A file sent with a message (one per message). The bytes are stored in
    SQLite so the demo needs no separate file storage."""

    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Random, unguessable token used in the download URL.
    key: Mapped[str] = mapped_column(String(48), unique=True)
    uploader_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    # NULL between upload and send.
    message_id: Mapped[int | None] = mapped_column(
        ForeignKey("messages.id", ondelete="CASCADE"), unique=True
    )
    filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(100))
    size: Mapped[int] = mapped_column(Integer)
    # Image dimensions, so the client can reserve space before it loads.
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    data: Mapped[bytes] = deferred(mapped_column(LargeBinary))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    message: Mapped[Message | None] = relationship(back_populates="attachment")


class MessageReceipt(Base):
    """One row per (message, recipient). Created when the message is sent;
    delivered_at / read_at are filled in as the recipient's client reports."""

    __tablename__ = "message_receipts"
    __table_args__ = (Index("ix_receipts_user_unread", "user_id", "read_at"),)

    message_id: Mapped[int] = mapped_column(
        ForeignKey("messages.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime)
    read_at: Mapped[datetime | None] = mapped_column(DateTime)


class Reaction(Base):
    """One emoji reaction per user per message (as in Signal)."""

    __tablename__ = "reactions"

    message_id: Mapped[int] = mapped_column(
        ForeignKey("messages.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    emoji: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
