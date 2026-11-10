"use client";

import { ChevronDown, Info, Lock, Timer, UserPlus, Users } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { dayLabel, formatPhone, isSameDay } from "@/lib/format";
import { conversationTitle, directPeer, isNoteToSelf, systemText, type NameContext } from "@/lib/names";
import type { Conversation } from "@/lib/types";
import { useNow } from "@/hooks/useNow";
import { useChat, type UIMessage } from "@/store/chat";
import { toast, useUI } from "@/store/ui";
import { Avatar, ConversationAvatar } from "../ui/Avatar";
import { TypingDots } from "../ui/TypingDots";
import { MessageBubble } from "./MessageBubble";

const GROUP_WINDOW_MS = 5 * 60_000;

type Row =
  | { kind: "day"; key: string; label: string }
  | { kind: "system"; key: string; msg: UIMessage }
  | { kind: "msg"; key: string; msg: UIMessage; first: boolean; last: boolean };

/** Consecutive messages from one sender within a few minutes form a run:
 *  tighter spacing, joined corners, one name label and one avatar. */
function continues(a: UIMessage | undefined, b: UIMessage | undefined) {
  return (
    !!a && !!b && a.kind === "text" && b.kind === "text" && a.sender_id === b.sender_id &&
    Math.abs(Date.parse(b.created_at) - Date.parse(a.created_at)) < GROUP_WINDOW_MS && isSameDay(a.created_at, b.created_at)
  );
}

function buildRows(items: UIMessage[], now: number): Row[] {
  const rows: Row[] = [];
  items.forEach((msg, i) => {
    const prev = items[i - 1];
    const next = items[i + 1];
    if (!prev || !isSameDay(prev.created_at, msg.created_at)) {
      rows.push({ kind: "day", key: `day-${msg.created_at.slice(0, 10)}-${i}`, label: dayLabel(msg.created_at, now) });
    }
    // Keep the key stable when an optimistic message is replaced by the server copy.
    const key = msg.client_id ? `c-${msg.sender_id}-${msg.client_id}` : `m-${msg.id}`;
    if (msg.kind === "system") rows.push({ kind: "system", key, msg });
    else rows.push({ kind: "msg", key, msg, first: !continues(prev, msg), last: !continues(msg, next) });
  });
  return rows;
}

function SystemRow({ msg, ctx }: { msg: UIMessage; ctx: NameContext }) {
  const Icon = msg.body === "timer_changed" ? Timer : msg.body.startsWith("member") || msg.body === "group_created" ? Users : Info;
  return (
    <div className="flex justify-center px-8 py-2.5">
      <p className="flex max-w-md items-start gap-1.5 text-center text-body-sm text-ink-2">
        <Icon size={14} className="mt-[1px] shrink-0" />
        {systemText(ctx, msg)}
      </p>
    </div>
  );
}

function Hero({ conv, ctx }: { conv: Conversation; ctx: NameContext }) {
  const contactIds = useChat((s) => s.contactIds);
  const note = isNoteToSelf(conv, ctx.meId);
  const peer = conv.kind === "direct" && !note ? directPeer(conv, ctx.meId) : undefined;
  const user = peer && (ctx.users[peer.id] ?? peer);
  const isContact = !!peer && contactIds.includes(peer.id);

  async function addContact() {
    if (!user) return;
    try {
      useChat.getState().addContact(await api.addContact(user.phone));
      toast(`${user.display_name} added to contacts`);
    } catch {
      toast("Couldn't add contact", { tone: "error" });
    }
  }

  return (
    <div className="flex flex-col items-center px-6 pb-6 pt-10 text-center">
      <ConversationAvatar conv={conv} ctx={ctx} size={80} />
      <h2 className="mt-3 text-title font-semibold">{conversationTitle(ctx, conv)}</h2>
      {user?.about && <p className="mt-1 text-body text-ink-2">{user.about}</p>}
      {user && <p className="mt-0.5 text-body-sm text-ink-3">{formatPhone(user.phone)}</p>}
      {conv.kind === "group" && (
        <p className="mt-1 text-body text-ink-2">
          {conv.members.length} member{conv.members.length === 1 ? "" : "s"}
          {conv.description && <span className="mt-1 block text-body-sm text-ink-3">{conv.description}</span>}
        </p>
      )}
      {peer && !isContact && (
        <button className="btn-secondary mt-4 h-8 text-body-sm" onClick={addContact}>
          <UserPlus size={15} /> Add to contacts
        </button>
      )}
      <p className="mt-5 flex max-w-sm items-start gap-2 rounded-xl bg-field px-3 py-2 text-left text-body-sm text-ink-2">
        <Lock size={14} className="mt-0.5 shrink-0" />
        {note
          ? "Add notes to yourself. They're only visible to you and your linked devices."
          : "Messages and calls are end-to-end encrypted. No one outside of this chat can read or listen to them."}
      </p>
    </div>
  );
}

function TypingRow({ conv, ctx, userIds }: { conv: Conversation; ctx: NameContext; userIds: number[] }) {
  const typer = ctx.users[userIds[0]];
  return (
    <div className="mt-2.5 flex items-end gap-1.5 px-3 md:px-4">
      {conv.kind === "group" && typer && <Avatar name={typer.display_name} color={typer.avatar_color} url={typer.avatar_url} size={28} />}
      <div className="rounded-[18px] bg-bubble-in px-3.5 py-3 text-ink-3">
        <TypingDots />
      </div>
    </div>
  );
}

export function MessageList({ conv, ctx }: { conv: Conversation; ctx: NameContext }) {
  const thread = useChat((s) => s.threads[conv.id]);
  const loadOlder = useChat((s) => s.loadOlder);
  const typingMap = useChat((s) => s.typing[conv.id]);
  const focusId = useUI((s) => s.focusMessageId);
  const focusMessage = useUI((s) => s.focusMessage);
  const hasExpiring = !!thread?.items.some((m) => m.expires_at);
  const now = useNow(hasExpiring ? 1000 : 30_000);

  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const restore = useRef<{ height: number; top: number } | null>(null);
  const [showJump, setShowJump] = useState(false);

  // Disappearing messages vanish locally the moment they expire.
  const items = useMemo(() => (thread?.items ?? []).filter((m) => !m.expires_at || Date.parse(m.expires_at) > now), [thread?.items, now]);
  const rows = useMemo(() => buildRows(items, now), [items, now]);
  const typers = Object.keys(typingMap ?? {}).map(Number);
  const lastItem = items[items.length - 1];

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // After history loads or new messages arrive, keep the view pinned correctly.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (restore.current) {
      // Older messages were prepended: keep the same message under the cursor.
      el.scrollTop = el.scrollHeight - restore.current.height + restore.current.top;
      restore.current = null;
    } else if (atBottom.current || lastItem?.sender_id === ctx.meId) {
      el.scrollTop = el.scrollHeight;
    }
  }, [rows.length, lastItem?.id, lastItem?.sender_id, typers.length, ctx.meId]);

  // Jump to a quoted message.
  useEffect(() => {
    if (focusId == null) return;
    const el = document.getElementById(`msg-${focusId}`);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.remove("animate-flash");
      void el.offsetWidth;
      el.classList.add("animate-flash");
    } else {
      toast("That message is no longer available");
    }
    focusMessage(null);
  }, [focusId, focusMessage]);

  function onScroll() {
    const el = scroller.current!;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottom.current = distance < 80;
    setShowJump(distance > 400);
    if (el.scrollTop < 150 && thread?.hasMore && !thread.loading) {
      restore.current = { height: el.scrollHeight, top: el.scrollTop };
      void loadOlder(conv.id);
    }
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scroller} onScroll={onScroll} className="h-full overflow-y-auto overflow-x-hidden pb-3" role="log" aria-label="Messages">
        {thread?.loaded && !thread.hasMore && <Hero conv={conv} ctx={ctx} />}
        {thread?.loading && <div className="py-4 text-center text-body-sm text-ink-3">Loading…</div>}
        {rows.map((row) =>
          row.kind === "day" ? (
            <div key={row.key} className="py-3 text-center text-body-sm font-medium text-ink-2">
              {row.label}
            </div>
          ) : row.kind === "system" ? (
            <SystemRow key={row.key} msg={row.msg} ctx={ctx} />
          ) : (
            <MessageBubble
              key={row.key}
              msg={row.msg}
              ctx={ctx}
              isGroup={conv.kind === "group"}
              canInteract={conv.is_member}
              first={row.first}
              last={row.last}
              now={now}
            />
          ),
        )}
        {typers.length > 0 && <TypingRow conv={conv} ctx={ctx} userIds={typers} />}
      </div>
      {showJump && (
        <button
          className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-pane text-ink-2 shadow-pop hover:text-ink"
          onClick={() => scrollToBottom(true)}
          aria-label="Scroll to latest"
        >
          <ChevronDown size={20} />
        </button>
      )}
    </div>
  );
}
