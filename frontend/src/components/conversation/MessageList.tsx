"use client";

import { ChevronDown, ChevronRight, Info, NotebookPen, Timer, UserPlus, UserRoundSearch, Users } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { dayLabel, isSameDay } from "@/lib/format";
import { conversationTitle, directPeer, isNoteToSelf, systemText, type NameContext } from "@/lib/names";
import type { Conversation } from "@/lib/types";
import { useNow } from "@/hooks/useNow";
import { useChat, type UIMessage } from "@/store/chat";
import { toast, useUI } from "@/store/ui";
import { Avatar, ConversationAvatar } from "../ui/Avatar";
import { TypingDots } from "../ui/TypingDots";
import { HEADER_HEIGHT } from "./ConversationHeader";
import { MessageBubble } from "./MessageBubble";

const GROUP_WINDOW_MS = 5 * 60_000;

type Row =
  | { kind: "day"; key: string; label: string }
  | { kind: "unread"; key: string; count: number }
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

function buildRows(items: UIMessage[], now: number, unread: { id: number; count: number } | null): Row[] {
  const rows: Row[] = [];
  items.forEach((msg, i) => {
    const prev = items[i - 1];
    const next = items[i + 1];
    if (!prev || !isSameDay(prev.created_at, msg.created_at)) {
      rows.push({ kind: "day", key: `day-${msg.created_at.slice(0, 10)}-${i}`, label: dayLabel(msg.created_at, now) });
    }
    if (unread && msg.id === unread.id) rows.push({ kind: "unread", key: "unread-divider", count: unread.count });
    // Keep the key stable when an optimistic message is replaced by the server copy.
    const key = msg.client_id ? `c-${msg.sender_id}-${msg.client_id}` : `m-${msg.id}`;
    if (msg.kind === "system") rows.push({ kind: "system", key, msg });
    else {
      // A divider breaks a run, so the first unread message starts a fresh group.
      const afterDivider = unread?.id === msg.id;
      const beforeDivider = unread?.id === next?.id;
      rows.push({
        kind: "msg",
        key,
        msg,
        first: afterDivider || !continues(prev, msg),
        last: beforeDivider || !continues(msg, next),
      });
    }
  });
  return rows;
}

function SystemRow({ msg, ctx }: { msg: UIMessage; ctx: NameContext }) {
  const Icon = msg.body === "timer_changed" ? Timer : msg.body.startsWith("member") || msg.body === "group_created" ? Users : Info;
  return (
    <div className="flex justify-center px-8 py-2.5">
      <p className="flex max-w-md items-start gap-1.5 text-center text-body text-ink-2">
        <Icon size={16} className="mt-0.5 shrink-0" />
        {systemText(ctx, msg)}
      </p>
    </div>
  );
}

function joinTitles(titles: string[]): string {
  if (titles.length === 1) return titles[0];
  if (titles.length === 2) return `${titles[0]} and ${titles[1]}`;
  return `${titles[0]}, ${titles[1]} and ${titles.length - 2} more`;
}

/** The card at the start of a chat, modelled on Signal's: avatar overlapping a
 *  rounded outline, the name with a chevron to the chat's settings, and facts
 *  about the person (unverified name, groups in common). */
function Hero({ conv, ctx }: { conv: Conversation; ctx: NameContext }) {
  const contactIds = useChat((s) => s.contactIds);
  const conversations = useChat((s) => s.conversations);
  const setDetailsOpen = useUI((s) => s.setDetailsOpen);
  const note = isNoteToSelf(conv, ctx.meId);
  const peer = conv.kind === "direct" && !note ? directPeer(conv, ctx.meId) : undefined;
  const user = peer && (ctx.users[peer.id] ?? peer);
  const isContact = !!peer && contactIds.includes(peer.id);

  const commonGroups = useMemo(
    () =>
      peer
        ? Object.values(conversations)
            .filter((c) => c.kind === "group" && c.is_member && c.members.some((m) => m.user.id === peer.id))
            .map((c) => c.title ?? "Group")
        : [],
    [conversations, peer],
  );

  async function addContact() {
    if (!user) return;
    try {
      useChat.getState().addContact(await api.addContact(user.phone));
      toast(`${user.display_name} added to contacts`);
    } catch {
      toast("Couldn't add contact", { tone: "error" });
    }
  }

  const line = "flex items-center justify-center gap-1.5 text-body text-ink";

  return (
    <div className="flex flex-col items-center px-6 pb-2 pt-10">
      <div className="relative w-full max-w-[300px] rounded-[30px] border-[1.5px] border-[var(--hero-border)] px-6 pb-5 pt-[68px] text-center">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-4">
          <ConversationAvatar conv={conv} ctx={ctx} size={72} />
        </div>
        <button
          className="inline-flex max-w-full items-center gap-0.5 rounded-lg px-1 text-[20px] font-semibold leading-7 hover:bg-hover"
          onClick={() => setDetailsOpen(true)}
          aria-label={`${conversationTitle(ctx, conv)}: open ${conv.kind === "group" ? "group" : "chat"} settings`}
        >
          <span className="truncate">{conversationTitle(ctx, conv)}</span>
          <ChevronRight size={20} className="shrink-0 text-ink-2" />
        </button>

        <div className="mt-3 flex flex-col items-center gap-2.5">
          {peer && !isContact && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-chip px-3 py-1 text-body text-chip-ink" title="This name comes from their profile, not your contacts">
              <UserRoundSearch size={15} /> Name not verified
            </span>
          )}
          {user?.about && <p className="text-body text-ink-2">{user.about}</p>}
          {peer && (
            <p className={line}>
              <Users size={15} className="shrink-0" />
              {commonGroups.length ? `Member of ${joinTitles(commonGroups)}` : "No groups in common"}
            </p>
          )}
          {conv.kind === "group" && (
            <p className={line}>
              <Users size={15} className="shrink-0" />
              {conv.members.length} member{conv.members.length === 1 ? "" : "s"}
            </p>
          )}
          {conv.kind === "group" && conv.description && <p className="text-body text-ink-2">{conv.description}</p>}
          {note && (
            <p className={line}>
              <NotebookPen size={15} className="shrink-0" /> Notes you send here are only visible to you
            </p>
          )}
        </div>
      </div>
      {peer && !isContact && (
        <button className="btn-secondary mt-3 h-8 text-body-sm" onClick={addContact}>
          <UserPlus size={15} /> Add to contacts
        </button>
      )}
    </div>
  );
}

function TypingRow({ conv, ctx, userIds }: { conv: Conversation; ctx: NameContext; userIds: number[] }) {
  const typer = ctx.users[userIds[0]];
  return (
    <div className="mt-2.5 flex items-end gap-1.5 px-4">
      {conv.kind === "group" && typer && <Avatar name={typer.display_name} color={typer.avatar_color} url={typer.avatar_url} size={28} />}
      <div className="rounded-[18px] bg-bubble-in px-3.5 py-3 text-ink-3">
        <TypingDots />
      </div>
    </div>
  );
}

export function MessageList({ conv, ctx, unreadAtOpen }: { conv: Conversation; ctx: NameContext; unreadAtOpen: number }) {
  const thread = useChat((s) => s.threads[conv.id]);
  const loadOlder = useChat((s) => s.loadOlder);
  const typingMap = useChat((s) => s.typing[conv.id]);
  const focusId = useUI((s) => s.focusMessageId);
  const focusMessage = useUI((s) => s.focusMessage);
  const hasExpiring = !!thread?.items.some((m) => m.expires_at);
  const now = useNow(hasExpiring ? 1000 : 30_000);

  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const placed = useRef(false); // initial scroll position done
  const restore = useRef<{ height: number; top: number } | null>(null);
  const [showJump, setShowJump] = useState(false);

  // The first unread message when the chat was opened, fixed once history loads
  // (later messages arriving must not move the divider).
  const [unread, setUnread] = useState<{ id: number; count: number } | null>(null);
  useEffect(() => {
    if (!thread?.loaded || unreadAtOpen === 0 || unread) return;
    const incoming = thread.items.filter((m) => m.kind === "text" && m.sender_id !== ctx.meId && m.id > 0);
    const first = incoming.at(-Math.min(unreadAtOpen, incoming.length));
    if (first) setUnread({ id: first.id, count: unreadAtOpen });
  }, [thread?.loaded, thread?.items, unreadAtOpen, unread, ctx.meId]);

  // Disappearing messages vanish locally the moment they expire.
  const items = useMemo(() => (thread?.items ?? []).filter((m) => !m.expires_at || Date.parse(m.expires_at) > now), [thread?.items, now]);
  const rows = useMemo(() => buildRows(items, now, unread), [items, now, unread]);
  const typers = Object.keys(typingMap ?? {}).map(Number);
  const lastItem = items[items.length - 1];
  const waitingForDivider = unreadAtOpen > 0 && !unread;

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Keep the view pinned correctly as history loads and messages arrive.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !thread?.loaded) return;
    if (!placed.current) {
      if (waitingForDivider) return;
      placed.current = true;
      const divider = el.querySelector<HTMLElement>("[data-unread-divider]");
      if (divider) {
        // Open at the first unread message, just below the floating header.
        el.scrollTop = divider.offsetTop - HEADER_HEIGHT - 24;
        atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      } else {
        el.scrollTop = el.scrollHeight;
      }
      return;
    }
    if (restore.current) {
      // Older messages were prepended: keep the same message under the cursor.
      el.scrollTop = el.scrollHeight - restore.current.height + restore.current.top;
      restore.current = null;
    } else if (atBottom.current || lastItem?.sender_id === ctx.meId) {
      el.scrollTop = el.scrollHeight;
    }
  }, [rows.length, lastItem?.id, lastItem?.sender_id, typers.length, ctx.meId, thread?.loaded, waitingForDivider]);

  // Jump to a quoted message or a search match.
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
      <div
        ref={scroller}
        onScroll={onScroll}
        className="h-full overflow-y-auto overflow-x-hidden pb-3"
        style={{ paddingTop: HEADER_HEIGHT }}
        role="log"
        aria-label="Messages"
      >
        {thread?.loaded && !thread.hasMore && <Hero conv={conv} ctx={ctx} />}
        {thread?.loading && <div className="py-4 text-center text-body-sm text-ink-3">Loading…</div>}
        {rows.map((row) =>
          row.kind === "day" ? (
            <div key={row.key} className="pb-3 pt-6 text-center text-body text-ink-2">
              {row.label}
            </div>
          ) : row.kind === "unread" ? (
            <div key={row.key} data-unread-divider className="my-3 flex items-center gap-3 px-6 text-body-sm font-medium text-ink-2">
              <span className="h-px flex-1 bg-[var(--hero-border)]" />
              {row.count === 1 ? "1 unread message" : `${row.count} unread messages`}
              <span className="h-px flex-1 bg-[var(--hero-border)]" />
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
          className="absolute bottom-3 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-raised text-ink shadow-pop hover:brightness-110"
          onClick={() => scrollToBottom(true)}
          aria-label="Scroll to latest"
        >
          <ChevronDown size={22} />
        </button>
      )}
    </div>
  );
}
