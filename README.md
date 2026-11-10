# Signal Clone

[![CI](https://github.com/suryapranav/Signal-clone/actions/workflows/ci.yml/badge.svg)](https://github.com/suryapranav/Signal-clone/actions/workflows/ci.yml)

A functional clone of the Signal messenger: phone-number onboarding, contacts, 1:1 and group chats, and real-time messaging with sent / delivered / read receipts, typing indicators and presence.

- **Frontend:** Next.js 15 (App Router, TypeScript), Tailwind CSS, Zustand
- **Backend:** FastAPI, SQLAlchemy 2.0, SQLite (as the brief specifies; the same code can also run on Postgres)
- **Real-time:** a single WebSocket per client (FastAPI / Starlette)
- **Tests:** pytest for the API and WebSocket flows (run on SQLite, and on Postgres to keep the optional support honest), Playwright for two-user browser flows, all in CI

> **Live demo:** https://signal-clone-self.vercel.app · **API docs:** https://signal-clone-api-rcv0.onrender.com/docs
>
> The backend runs on Render's free tier, so the first request after a while may take ~50 seconds to wake it up.

## Features

**Core**
- **Onboarding:** phone number → 6-digit code (mocked, `123456`) → profile (name, photo or avatar color). Sessions persist across reloads; log out from Settings.
- **Chat list:** sorted by latest activity with pinned chats first, last-message preview with your own message's receipt icon, unread badges, online dots, live "typing" dots, search across chats and contacts, an unread-only filter, and archive, pin and mute from each row's menu.
- **1:1 messaging:** real-time delivery, timestamps, typing indicators, and Signal's sending / sent / delivered / read circles. Sends are optimistic and can be retried if they fail. Opening a chat jumps to an "N unread messages" divider, and **Message details** shows who each message was delivered to and read by, and when.
- **Groups:** create with a name, color and members; view members; admins can add or remove members, promote or demote admins, and edit the name and description; any member can leave. Every change appears as a system message ("Alice added Bob.") worded from each viewer's point of view.
- **Contacts:** add by phone number or username, start chats from contacts, and an "Add to contacts" prompt for people you've chatted with but not saved.
- **Signal experience:** nav rail with Chats, Calls and Stories; three-pane layout; grouped message bubbles with sender names and avatars in groups; date separators; conversation header with presence or last seen; chat and group settings pages; modals; toasts; settings pages (profile, appearance, chats, notifications, privacy, linked devices).

**Bonus**
- Attachments: images and files up to 5 MB, added with the paperclip, by pasting, or by dragging onto the chat. Photos show inline with a full-screen viewer; files show as download cards. Uploads are optimistic and show a local preview immediately.
- Emoji reactions (Signal's six quick reactions; one per person; tap a reaction to toggle it)
- Reply-to with quoted messages (click a quote to jump to the original)
- **Edit** your messages (others see "Edited") and **delete for everyone** (a "This message was deleted" placeholder stays), both within 24 hours of sending and updated live for everyone in the chat
- Disappearing messages that actually work (per-chat timer; messages count down and are deleted on the server)
- Dark mode (System, Light or Dark)
- Working settings: read receipts (enforced on the server, both ways, as in Signal), typing indicators, Enter key sends, spell check, notification pop-ups, sound and content
- Responsive layout: single pane with back navigation on phones
- Search inside a chat, with matches highlighted and up/down to step through them
- Keyboard shortcuts: `Ctrl/⌘ K` search · `Ctrl/⌘ Alt N` new chat · `Alt ↑/↓` switch chats · `Esc` cancel reply or close panel · `Ctrl/⌘ /` list all shortcuts
- Jumbo emoji, emoji picker, per-chat drafts, unread count in the tab title, and in-app message notifications

**Placeholders ("Coming soon"):** voice and video calls, Stories, linked devices, and voice notes.

## Demo accounts

Every number uses the verification code **`123456`** (verification is mocked).

| Name | Phone | Notes |
|---|---|---|
| Alice Chen | +1 555 010 0001 | Most seeded chats, admin of "Weekend Hike" (which has a photo and a file) |
| Bob Martinez | +1 555 010 0002 | |
| Priya Sharma | +1 555 010 0003 | Admin of "Product Team" |
| Diego Alvarez | +1 555 010 0006 | |

`+1 555 010 0004`, `…0005`, `…0007` and `…0008` also exist. Any other number registers a new account.

**Try it:** open Alice in one browser and Bob in a private window, then message each other to watch typing, delivery and read receipts update live.

## Running locally

**Backend** (Python 3.10+):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload            # http://localhost:8000, docs at /docs
pytest                                    # REST + WebSocket tests (SQLite)
TEST_DATABASE_URL=postgresql://user:pass@localhost/signal_test pytest   # same suite on Postgres
python -m app.seed --reset                # wipe and re-seed the database
```

The database (`backend/signal.db`) is created and seeded automatically on first start. The app is built and deployed on SQLite. It can optionally run on Postgres by setting `DATABASE_URL` (for example `postgresql://user:pass@localhost/signal`); the tables are created and seeded the same way.

**Frontend** (Node 18.18+):

```bash
cd frontend
cp .env.example .env.local                # NEXT_PUBLIC_API_URL=http://localhost:8000
npm install
npm run dev                               # http://localhost:3000
```

**Browser tests** (Playwright):

```bash
cd frontend
npx playwright install chromium           # once
npm run test:e2e                          # needs the backend's Python packages installed
```

The browser tests start their own backend (with a fresh SQLite database) and a production build of the frontend on ports 8010 and 3010, so they don't touch your dev servers or data. They cover sign-up, two people chatting live (typing, receipts, reactions, replies, message details), editing and deleting for everyone, unread counts, groups and member removal, attachments, disappearing messages, search and archive, settings that change behaviour (Enter key sends, read receipts), and the phone layout. Any browser console error fails the test.

## Architecture

```
Browser (Next.js)                          FastAPI (single process)
┌──────────────────────┐   REST /api/*    ┌───────────────────────────────┐
│ UI components        │ ───────────────▶ │ routers/   HTTP + validation  │
│ Zustand store        │                  │ services/  business rules     │
│ api.ts / socket.ts   │ ◀─── WS /ws ──── │ realtime   socket registry    │
└──────────────────────┘   server pushes  │ models     SQLAlchemy → DB    │
                                          └───────────────────────────────┘
```

- **All writes go through REST** (send message, create group, add member…), so they get normal validation and error responses. After committing, the server pushes events to the affected users' sockets.
- **The WebSocket carries pushes plus cheap signals** from the client: `typing`, `read` and `ping`.
- **`realtime.ConnectionManager`** maps user id → open sockets (several tabs or devices per user). It lives in process memory, so the backend runs as **one instance**. Scaling out would mean swapping it for Redis pub/sub behind the same interface.
- **Disappearing messages:** a background task deletes expired messages every few seconds and pushes `message.deleted`. Expired rows are also filtered out of every query, so they never show up even between purges.

### Message status lifecycle

| Status | When | Where it lives |
|---|---|---|
| sending | Optimistic UI until `POST /messages` returns | client only |
| sent | Message stored; one `message_receipts` row created per recipient | server |
| delivered | Every recipient's device got the push (immediately if online, otherwise when their socket next connects) | `receipts.delivered_at` |
| read | Every recipient opened the chat | `receipts.read_at` |

Status is computed from receipts rather than stored on the message, so groups work the same way as 1:1 chats: a group message shows "read" once every member has read it. Each receipt change pushes the new aggregate status to the sender.

Retries are safe: the client sends a `client_id`, and `(sender_id, client_id)` is unique, so a retried request returns the original message instead of creating a duplicate.

## Database schema

```mermaid
erDiagram
    users ||--o{ auth_sessions : "signs in"
    users ||--o{ contacts : owns
    users ||--o{ contacts : "is saved as"
    users ||--o{ conversation_members : joins
    conversations ||--o{ conversation_members : has
    conversations ||--o{ messages : contains
    users ||--o{ messages : sends
    messages ||--o{ message_receipts : "tracked by"
    users ||--o{ message_receipts : receives
    messages ||--o{ reactions : has
    users ||--o{ reactions : gives
    messages |o--o{ messages : "replies to"
    messages |o--o| attachments : carries
    users ||--o{ attachments : uploads

    users {
        int id PK
        string phone UK "E.164"
        string username UK "nullable, e.g. alice.01"
        string display_name
        string about
        string avatar_color "Signal palette key A100–A210"
        text avatar_url "data URL, nullable"
        datetime last_seen_at
        bool read_receipts "privacy setting"
    }
    auth_sessions {
        string token_hash PK "SHA-256 of bearer token"
        int user_id FK
        datetime expires_at
    }
    contacts {
        int id PK
        int owner_id FK
        int contact_id FK
        string nickname
    }
    conversations {
        int id PK
        string kind "direct | group"
        string direct_key UK "low_id:high_id, direct only"
        string title "groups only"
        string description
        int disappearing_seconds "NULL = off"
        int created_by FK
        datetime last_activity_at "chat list sort key"
    }
    conversation_members {
        int id PK
        int conversation_id FK
        int user_id FK
        string role "admin | member"
        datetime joined_at
        datetime left_at "NULL = active"
        bool is_pinned
        bool is_archived
        bool is_muted
    }
    messages {
        int id PK
        int conversation_id FK
        int sender_id FK
        string kind "text | system"
        text body
        json meta "system event details"
        int reply_to_id FK
        string client_id "UK with sender_id"
        datetime created_at
        datetime expires_at "disappearing"
        datetime edited_at
        datetime deleted_at "delete for everyone"
    }
    message_receipts {
        int message_id PK,FK
        int user_id PK,FK
        datetime delivered_at
        datetime read_at
    }
    reactions {
        int message_id PK,FK
        int user_id PK,FK
        string emoji
    }
    attachments {
        int id PK
        string key UK "random token used in the download URL"
        int uploader_id FK
        int message_id FK,UK "NULL until sent"
        string filename
        string content_type
        int size
        int width "images only"
        int height "images only"
        blob data "deferred: never loaded when listing messages"
    }
```

### Design decisions

- **One `conversations` table for direct chats and groups.** Messages, receipts, unread counts and the chat list share one code path. A CHECK constraint enforces that `direct_key` is set if and only if the chat is direct.
- **`direct_key` is UNIQUE**, so two users can never end up with two separate 1:1 chats, even under concurrent requests. Note to Self is the direct chat `"<id>:<id>"`.
- **Membership is soft-deleted (`left_at`).** A removed member keeps read-only access to history up to their removal, as in Signal. Someone added later only sees messages from `joined_at` onward. Re-adding someone reopens the window.
- **Unread count = receipts with `read_at IS NULL`.** Status and unread badges come from the same table, so they can't drift apart. The `(user_id, read_at)` index keeps the query cheap.
- **System messages** ("Alice added Bob") are rows with `kind = 'system'`, an event key in `body` and details in `meta`. The client renders them from the viewer's perspective ("You added Bob" vs "Alice added Bob").
- **Delete for everyone keeps a tombstone.** The row stays with `deleted_at` set so every chat shows "This message was deleted" in the right place, but its text, file and reactions are removed, and quotes of it stop showing the text. Edits overwrite `body` and set `edited_at`; the server allows both only for the sender, within 24 hours.
- **Read receipts are a two-way privacy setting.** A read only counts toward "read" if the reader has receipts on, and a sender who turned them off never sees "read". The rule lives in the one query that computes statuses, so ticks, group status and Message details all follow it.
- **Only a hash of the session token is stored**, so a leaked database doesn't leak working sessions. Logout deletes the session row.
- **Attachments are uploaded first and linked when the message is sent.** Only the uploader can attach a file, and only once (`message_id` is UNIQUE). The bytes live in a deferred BLOB column, so message lists never load file contents. Image width and height are stored so the client can reserve space before the image loads, which keeps the chat from jumping.
- **SQLite, with portable SQL.** The brief specifies SQLite, and the demo runs on it. Everything goes through SQLAlchemy with no SQLite-only queries, so the same schema also runs on Postgres by changing `DATABASE_URL`; CI runs the backend suite on both to keep it that way.
- **Foreign keys are enforced** (Postgres always; SQLite with `PRAGMA foreign_keys=ON`) with explicit `ON DELETE` behaviour: receipts, reactions and attachments cascade with their message, and replies keep existing with `reply_to_id` set to NULL.

## API overview

All endpoints are under `/api` and take `Authorization: Bearer <token>`, except the auth endpoints. Interactive docs are at `/docs`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/request-otp` | Start registration or login (mock SMS; returns the code hint) |
| POST | `/auth/verify-otp` | Verify the code → `{token, user, needs_profile}`; creates the account on first login |
| POST | `/auth/logout` | Revoke the current session |
| GET / PATCH | `/users/me` | Read or update profile (name, about, avatar, username) |
| GET | `/users/lookup?q=` | Find a user by exact phone number or username |
| GET / POST | `/contacts` | List contacts / add one by phone or username |
| DELETE | `/contacts/{user_id}` | Remove a contact |
| GET | `/conversations` | Chat list with last message, unread count, members and presence |
| GET | `/conversations/{id}` | One conversation |
| POST | `/conversations/direct` | Get or create the 1:1 chat with a user |
| POST | `/conversations/group` | Create a group (creator becomes admin) |
| PATCH | `/conversations/{id}` | Group name / description / colour, disappearing timer (admins) |
| PATCH | `/conversations/{id}/prefs` | Your own pin / archive / mute settings |
| POST | `/conversations/{id}/read` | Mark everything in the chat as read |
| POST | `/conversations/{id}/members` | Add members (admin) |
| DELETE | `/conversations/{id}/members/{user_id}` | Remove a member (admin), or leave (yourself) |
| PATCH | `/conversations/{id}/members/{user_id}` | Make or revoke admin (admin) |
| GET | `/conversations/{id}/messages?before_id=` | Paginated history, oldest first |
| POST | `/conversations/{id}/messages` | Send `{body, client_id, reply_to_id?, attachment_id?}` (body may be empty if there's an attachment) |
| POST | `/attachments` | Upload a file (multipart, max 5 MB) → `{id, url, …}` to use as `attachment_id` |
| GET | `/attachments/{key}` | Download a sent attachment (see note below) |
| PATCH | `/messages/{id}` | Edit your own message's text (within 24 hours) |
| DELETE | `/messages/{id}` | Delete your own message for everyone (within 24 hours) |
| PUT / DELETE | `/messages/{id}/reaction` | Set or remove your emoji reaction |
| GET | `/messages/{id}/info` | Message details: per-recipient delivered and read times (the sender sees everyone; others see only themselves) |
| WS | `/ws?token=` | Real-time events (see below) |

**Attachment downloads** use a random, unguessable key in the URL instead of the bearer token, because `<img>` tags can't send an `Authorization` header (the same idea as an S3 presigned URL). Only JPEG, PNG, GIF and WebP render inline. Everything else, including SVG and HTML, is served as a download with `nosniff` and a sandbox CSP, so an uploaded file can't run scripts on the API's origin.

**Server → client events:** `message.new`, `message.updated` (edited or deleted for everyone), `message.status`, `message.reactions`, `message.deleted`, `conversation.updated`, `conversation.read`, `typing`, `presence`, `user.updated`.
**Client → server events:** `typing`, `read`, `ping`.

## Project structure

```
backend/
  app/
    main.py              app wiring, CORS, startup seed, purge task
    config.py            environment settings
    database.py          engine and session (SQLite or Postgres)
    models.py            SQLAlchemy schema
    schemas.py           Pydantic request/response models
    security.py          session tokens, current-user dependency
    realtime.py          WebSocket connection registry
    seed.py              demo data
    seed_assets.py       generated demo photo and file (no binaries in the repo)
    routers/             auth, users, contacts, conversations, messages, attachments, ws
    services/
      conversations.py   membership and admin rules
      messaging.py       message creation, receipts, event fan-out
      serializers.py     viewer-aware ORM → API conversion (batched queries)
  tests/                 REST + WebSocket tests
frontend/
  e2e/                   Playwright browser tests (two users, phone layout)
  src/
    app/                 Next.js entry (layout, theme bootstrap, page)
    lib/
      types.ts           TypeScript mirror of the API contract
      api.ts             typed REST client
      socket.ts          reconnecting WebSocket client (backoff, heartbeat, resync)
      actions.ts         cross-store actions (open chat, start DM, pin/archive/mute)
      names.ts           display names, chat titles, system-message text
      format.ts          Signal-style timestamps and timer labels
      colors.ts          Signal avatar palette
      files.ts           attachment validation, image measuring, labels
    store/
      chat.ts            Zustand store: users, chats, threads, typing + event reducer
      ui.ts              navigation, modals, toasts, theme
      session.ts         sign in / sign out
    hooks/               useRealtime, useNames, useNow
    components/
      onboarding/        phone, code and profile steps
      shell/             app shell, nav rail, placeholders
      chats/             chat list, rows, new chat, new group
      conversation/      header, message list, bubble, composer
      details/           chat / group settings and member admin
      settings/          settings pages, avatar picker
      modals/            find user, add members, edit group, safety number, confirm…
      ui/                Avatar, StatusIcon, Modal, Menu, Toasts, Switch
```

### Frontend data flow

1. **Bootstrap:** after sign-in the app loads `/conversations` and `/contacts` into the Zustand store, then opens the WebSocket.
2. **Server events** go through a single reducer (`applyEvent` in `store/chat.ts`). Components subscribe to small slices of the store, so a typing event only re-renders what shows typing.
3. **Sending is optimistic:** the message appears immediately as *sending* with a client-generated `client_id`. The REST response and the socket echo are matched by that id, and status only ever moves forward (sent → delivered → read), so out-of-order events can't regress a tick.
4. **Read receipts:** opening a chat, or a message arriving while the chat is visible, sends a `read` event over the socket (falling back to REST if the socket is down).
5. **Reconnects:** the socket reconnects with exponential backoff and re-fetches the chat list and the open chat to catch anything missed while offline.

## Continuous integration

GitHub Actions (`.github/workflows/ci.yml`) runs four jobs on every push:

- **Backend tests** on SQLite and again on **Postgres 16**: REST and WebSocket flows, attachments, group admin, disappearing messages, message details, edit and delete for everyone, and the read-receipts setting.
- **Frontend** lint, typecheck and production build.
- **Browser tests**: the Playwright suite against the real backend and a production build. On failure, the HTML report with traces and screenshots is uploaded as a build artifact.

## Deployment

**Backend → Render** (free web service). The repo includes a `render.yaml` blueprint:
1. New → Blueprint → select this repo. It builds `backend/` and starts `uvicorn app.main:app`.
2. Any `*.vercel.app` frontend is already allowed by `CORS_ORIGIN_REGEX`. For a custom domain, add it to `CORS_ORIGINS`.

**Frontend → Vercel:**
1. Import the repo and set **Root Directory** to `frontend`.
2. Add the environment variable `NEXT_PUBLIC_API_URL=https://<your-render-service>.onrender.com`.

Render's free tier sleeps after inactivity, and the first request takes about 50 seconds to wake it. The SQLite file lives on Render's ephemeral disk, so the demo data is re-seeded on each restart or redeploy. Mounting a persistent disk (a paid Render feature) at the database path would keep it.

## Assumptions and mocks

- **Phone verification is mocked:** the code is always `123456`, and no SMS is sent.
- **End-to-end encryption is simulated:** messages are stored in plain text. The UI shows Signal's encryption notices and a safety-number screen for look and feel only.
- **Calls, Stories and Linked devices** are "Coming soon" placeholders.
- **Online / last seen** is real for connected users (based on open sockets); seeded users who never connect show a seeded "last seen" time.
- **Profile photos and attachments are stored in the database** (photos as data URLs up to ~400 KB, attachments as BLOBs up to 5 MB, one per message). This keeps deployment to an API plus a database, with no separate file storage.
- **Single backend instance:** the WebSocket registry is in memory.
- **Tables are created on startup** (`create_all`) rather than through migrations. Because the schema only grows, a small startup step (`add_missing_columns` in `database.py`) adds any new nullable column an existing database lacks, so a database created before a feature keeps working after an upgrade.
- **Settings live where they matter.** Read receipts are stored on the server because they change what other people see. The rest (theme, Enter key sends, spell check, typing indicators, notifications) are kept in the browser under the signed-in account's id, so several demo accounts can share one browser without inheriting each other's settings.
- **Edit and delete for everyone are limited to 24 hours after sending.** There's no edit history; the latest text replaces the old one.
- **Disappearing timers start when a message is sent** (Signal starts them when the message is read), which keeps the logic server-side and deterministic.

## What I'd do next

This demo deliberately trades scale and real cryptography for simplicity. For production:

- **Real end-to-end encryption.** Use the Signal Protocol: X3DH (or PQXDH) to agree on keys from published prekey bundles, then the Double Ratchet for per-message keys with forward secrecy. The server would only store and relay ciphertext plus prekeys, so read receipts, typing and reactions would also travel as encrypted messages. Groups would use sender keys. The safety-number screen would compare real identity-key fingerprints.
- **Horizontal scaling.** Replace the in-memory `ConnectionManager` with Redis pub/sub (or NATS) behind the same `send_to_users` interface, so any API instance can reach any user's socket. Sticky sessions are then not required.
- **Database at scale:** Alembic migrations instead of `create_all`, an async driver, and partitioning or archiving for `messages` and `message_receipts`, which grow as messages × recipients.
- **Object storage for attachments** (S3 or R2) with presigned, expiring upload and download URLs, image thumbnails, and virus scanning, instead of BLOBs in the database.
- **Delivery when the app is closed:** web push / APNs / FCM for offline users, and multi-device sync with per-device receipts.
- **Abuse and safety:** rate limits on OTP and sending, real SMS verification, message requests for unknown senders, and blocking and reporting.
- **More tests:** load tests for the WebSocket fan-out, and the browser suite on Firefox and WebKit as well as Chromium.

