"""Demo data: users, contacts, 1:1 chats and groups with realistic history.

Every account signs in with the fixed OTP (123456). Timestamps are relative to
"now" so the chat list always looks fresh after a redeploy.

Run manually with:  python -m app.seed --reset
"""

import argparse
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import Base, SessionLocal, engine, utcnow
from .models import (
    Contact,
    Conversation,
    ConversationMember,
    Message,
    MessageReceipt,
    Reaction,
    User,
)
from .services.conversations import direct_key

USERS = [
    # key, name, phone, username, color, about, last seen (minutes ago)
    ("alice", "Alice Chen", "+15550100001", "alice.01", "A110", "Coffee first ☕", 2),
    ("bob", "Bob Martinez", "+15550100002", "bob.02", "A130", "Trail runner 🏃", 5),
    ("priya", "Priya Sharma", "+15550100003", "priya.03", "A160", "Product @ Acme", 25),
    ("rahul", "Rahul Verma", "+15550100004", "rahul.04", "A120", "", 180),
    ("emma", "Emma Wilson", "+15550100005", "emma.05", "A150", "Available", 1440),
    ("diego", "Diego Alvarez", "+15550100006", "diego.06", "A180", "📷", 15),
    ("sara", "Sara Kim", "+15550100007", "sara.07", "A140", "Designing things", 300),
    ("kenji", "Kenji Tanaka", "+15550100008", "kenji.08", "A200", "", 4000),
]

CONTACTS = {
    "alice": ["bob", "priya", "rahul", "emma", "diego", "sara", "kenji"],
    "bob": ["alice", "priya", "diego", "rahul"],
    "priya": ["alice", "bob", "rahul", "sara", "kenji", "diego"],
    "rahul": ["alice", "priya", "bob"],
    "emma": ["alice"],
    "diego": ["alice", "bob", "priya"],
    "sara": ["alice", "priya", "kenji"],
    "kenji": ["alice", "priya", "sara"],
}


@dataclass
class Msg:
    sender: str
    text: str
    minutes_ago: int
    reply_to: int | None = None  # index into the same chat's messages
    reactions: dict[str, str] = field(default_factory=dict)  # user key -> emoji
    system: str | None = None  # system event key instead of text


@dataclass
class Chat:
    members: list[str]
    messages: list[Msg]
    title: str | None = None  # set → group
    admins: tuple[str, ...] = ()
    color: str = "A140"
    description: str = ""
    # user key -> how many of the latest messages (not sent by them) are unread
    unread: dict[str, int] = field(default_factory=dict)
    # user key -> how many of the latest messages haven't reached their device
    undelivered: dict[str, int] = field(default_factory=dict)


CHATS = [
    Chat(
        ["alice", "bob"],
        [
            Msg("bob", "Hey! Are we still on for tomorrow?", 180),
            Msg("alice", "Yes! 10am at the trailhead?", 175),
            Msg("bob", "Perfect. I'll bring the snacks 🍫", 172),
            Msg("alice", "You're the best", 170, reactions={"bob": "❤️"}),
            Msg("bob", "Btw did you see Priya's message in the group?", 12),
            Msg("bob", "She's thinking of adding a second route", 11),
        ],
        unread={"alice": 2},
    ),
    Chat(
        ["alice", "priya"],
        [
            Msg("priya", "Can you review the onboarding spec before standup?", 1500, reactions={"alice": "👍"}),
            Msg("alice", "On it, I'll leave comments in the doc", 1490),
            Msg("priya", "Thanks! The flows section is the one I'm least sure about", 1488),
            Msg("alice", "Done. Left a few notes on the OTP step", 1400, reply_to=2),
        ],
    ),
    Chat(
        ["alice", "rahul"],
        [
            Msg("rahul", "Lunch on Friday?", 3000),
            Msg("alice", "Sure, the new ramen place?", 2990),
            Msg("rahul", "🍜 yes", 2985),
        ],
    ),
    Chat(
        ["alice", "emma"],
        [
            Msg("emma", "Happy birthday!! 🎉", 8000),
            Msg("alice", "Thank you Emma! 😊", 7990),
            Msg("alice", "We should catch up soon", 60),
        ],
        unread={"emma": 1},
    ),
    Chat(
        ["alice", "kenji"],
        [
            Msg("kenji", "Great meeting you at the conference", 5000),
            Msg("alice", "Likewise! Sending you the photos tonight", 400),
        ],
        unread={"kenji": 1},
        undelivered={"kenji": 1},
    ),
    Chat(
        ["bob", "diego"],
        [
            Msg("diego", "Need a ride to the trailhead?", 240),
            Msg("bob", "Yes please, pick me up at 9?", 235),
            Msg("diego", "👍", 230),
        ],
    ),
    Chat(
        ["alice", "bob", "priya", "diego"],
        [
            Msg("alice", "group_created", 4000, system="group_created"),
            Msg("alice", "Who's in for Saturday?", 3990),
            Msg("bob", "Me!", 3985),
            Msg("diego", "Count me in 🙌", 3980),
            Msg("priya", "I found a second route that goes past the waterfall", 30),
            Msg("priya", "It's about 2km longer though", 29),
            Msg("diego", "Waterfall route for sure", 20, reply_to=4, reactions={"bob": "🔥", "priya": "😂"}),
        ],
        title="Weekend Hike 🥾",
        admins=("alice",),
        color="A130",
        description="Saturday trails and snacks",
        unread={"alice": 3},
    ),
    Chat(
        ["priya", "alice", "rahul", "sara", "kenji"],
        [
            Msg("priya", "group_created", 10000, system="group_created"),
            Msg("priya", "Sprint review moved to Thursday 3pm", 900),
            Msg("sara", "Works for me", 890),
            Msg("kenji", "Same 👍", 880),
            Msg("rahul", "I'll demo the new search", 870),
            Msg("alice", "Nice, can't wait to see it", 860),
        ],
        title="Product Team",
        admins=("priya",),
        color="A140",
    ),
]

NOTES = {
    "alice": [("Groceries: oat milk, eggs, spinach", 2000), ("Try the demo with two browsers side by side", 50)],
}


def _ago(now: datetime, minutes: int) -> datetime:
    return now - timedelta(minutes=minutes)


def _seed_chat(db: Session, chat: Chat, users: dict[str, User], now: datetime) -> None:
    start = _ago(now, chat.messages[0].minutes_ago + 1)
    is_group = chat.title is not None
    ids = [users[k].id for k in chat.members]
    conv = Conversation(
        kind="group" if is_group else "direct",
        direct_key=None if is_group else direct_key(*ids),
        title=chat.title,
        description=chat.description,
        avatar_color=chat.color,
        created_by=ids[0],
        created_at=start,
        last_activity_at=_ago(now, chat.messages[-1].minutes_ago),
    )
    conv.members = [
        ConversationMember(
            user_id=users[k].id, role="admin" if k in chat.admins else "member", joined_at=start
        )
        for k in chat.members
    ]
    db.add(conv)
    db.flush()

    created: list[Message] = []
    for m in chat.messages:
        sent_at = _ago(now, m.minutes_ago)
        msg = Message(
            conversation_id=conv.id,
            sender_id=users[m.sender].id,
            kind="system" if m.system else "text",
            body=m.system or m.text,
            meta={"title": chat.title} if m.system == "group_created" else None,
            reply_to_id=created[m.reply_to].id if m.reply_to is not None else None,
            created_at=sent_at,
        )
        db.add(msg)
        db.flush()
        created.append(msg)
        for user_key, emoji in m.reactions.items():
            db.add(Reaction(message_id=msg.id, user_id=users[user_key].id, emoji=emoji,
                            created_at=sent_at + timedelta(minutes=1)))

    # Receipts: everything read, except the latest N messages listed in
    # `unread` / `undelivered` for a given member.
    for k in chat.members:
        incoming = [(m, src) for m, src in zip(created, chat.messages) if not src.system and src.sender != k]
        n_unread = chat.unread.get(k, 0)
        n_undelivered = chat.undelivered.get(k, 0)
        for i, (msg, _src) in enumerate(reversed(incoming)):
            delivered = None if i < n_undelivered else msg.created_at + timedelta(seconds=2)
            read = None if i < n_unread else msg.created_at + timedelta(minutes=1)
            db.add(MessageReceipt(message_id=msg.id, user_id=users[k].id,
                                  delivered_at=delivered, read_at=read))


def seed(db: Session) -> None:
    now = utcnow()
    users: dict[str, User] = {}
    for key, name, phone, username, color, about, seen in USERS:
        users[key] = User(
            phone=phone, username=username, display_name=name, avatar_color=color,
            about=about, last_seen_at=_ago(now, seen), created_at=_ago(now, 20000),
        )
    db.add_all(users.values())
    db.flush()

    for owner, others in CONTACTS.items():
        db.add_all(Contact(owner_id=users[owner].id, contact_id=users[o].id) for o in others)

    for chat in CHATS:
        _seed_chat(db, chat, users, now)

    # Note to Self for everyone
    for key, user in users.items():
        notes = NOTES.get(key, [])
        conv = Conversation(
            kind="direct", direct_key=direct_key(user.id, user.id), created_by=user.id,
            created_at=_ago(now, 20000),
            last_activity_at=_ago(now, notes[-1][1]) if notes else _ago(now, 20000),
        )
        conv.members = [ConversationMember(user_id=user.id, joined_at=_ago(now, 20000))]
        db.add(conv)
        db.flush()
        db.add_all(
            Message(conversation_id=conv.id, sender_id=user.id, body=text, created_at=_ago(now, mins))
            for text, mins in notes
        )
    db.commit()


def seed_if_empty(db: Session) -> bool:
    if db.scalar(select(User.id).limit(1)) is not None:
        return False
    seed(db)
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed the demo database")
    parser.add_argument("--reset", action="store_true", help="drop all tables first")
    args = parser.parse_args()
    if args.reset:
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as session:
        print("seeded" if seed_if_empty(session) else "database already has data; use --reset")
