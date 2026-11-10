"use client";

import {
  Archive, ArrowLeft, Bell, BellOff, ChevronDown, ChevronUp, Ellipsis, LogOut, Phone, Pin, PinOff, Search, Settings2, ShieldCheck, Timer, Video, X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { comingSoon, openConversation, updatePrefs } from "@/lib/actions";
import { lastSeen, timerLabel } from "@/lib/format";
import { conversationTitle, directPeer, firstName, isNoteToSelf, type NameContext } from "@/lib/names";
import type { Conversation } from "@/lib/types";
import { useNow } from "@/hooks/useNow";
import { useChat } from "@/store/chat";
import { useUI } from "@/store/ui";
import { ConversationAvatar } from "../ui/Avatar";
import { Menu } from "../ui/Menu";
import { confirmLeaveGroup } from "../details/ConversationDetails";

/** Height of the floating header; the message list pads its top by this much. */
export const HEADER_HEIGHT = 60;

/** Messages scroll underneath a translucent, blurred bar (as in Signal Desktop). */
const BAR =
  "absolute inset-x-0 top-0 z-20 flex h-[60px] items-center gap-1 bg-[color-mix(in_srgb,var(--chat)_82%,transparent)] px-2 backdrop-blur-xl md:px-3";

function useSubtitle(conv: Conversation, ctx: NameContext): string {
  const now = useNow();
  const typers = Object.keys(useChat((s) => s.typing[conv.id]) ?? {}).map(Number);
  if (typers.length) {
    return conv.kind === "group" ? `${typers.map((id) => firstName(ctx, id)).join(", ")} typing…` : "typing…";
  }
  if (conv.kind === "group") {
    return conv.members
      .map((m) => (m.user.id === ctx.meId ? "You" : firstName(ctx, m.user.id)))
      .sort((a, b) => (a === "You" ? 1 : b === "You" ? -1 : a.localeCompare(b)))
      .join(", ");
  }
  if (isNoteToSelf(conv, ctx.meId)) return "";
  const peer = directPeer(conv, ctx.meId);
  const user = peer && (ctx.users[peer.id] ?? peer);
  if (!user) return "";
  return user.online ? "Online" : lastSeen(user.last_seen_at, now);
}

/** Find-in-chat: loads the whole history, then steps through matches newest first. */
function SearchBar({ conv, onClose }: { conv: Conversation; onClose: () => void }) {
  const query = useUI((s) => s.chatSearch);
  const setQuery = useUI((s) => s.setChatSearch);
  const focusMessage = useUI((s) => s.focusMessage);
  const thread = useChat((s) => s.threads[conv.id]);
  const loadOlder = useChat((s) => s.loadOlder);
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);
  // Search covers the whole chat, so fetch any older pages not loaded yet.
  useEffect(() => {
    if (thread?.hasMore && !thread.loading) void loadOlder(conv.id);
  }, [thread?.hasMore, thread?.loading, loadOlder, conv.id]);

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      q
        ? (thread?.items ?? [])
            .filter((m) => m.kind === "text" && m.id > 0 && m.body.toLowerCase().includes(q))
            .map((m) => m.id)
            .reverse()
        : [],
    [thread?.items, q],
  );

  useEffect(() => {
    setIndex(0);
    if (matches.length) focusMessage(matches[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- jump only when the query changes
  }, [q]);

  const go = (step: number) => {
    if (!matches.length) return;
    const next = (index + step + matches.length) % matches.length;
    setIndex(next);
    focusMessage(matches[next]);
  };

  return (
    <header className={BAR}>
      <div className="relative min-w-0 flex-1">
        <Search size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2" />
        <input
          ref={input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") go(e.shiftKey ? -1 : 1);
            if (e.key === "Escape") onClose();
          }}
          placeholder="Search messages in this chat"
          aria-label="Search messages in this chat"
          className="input h-8 rounded-lg pl-8"
        />
      </div>
      <span className="w-16 shrink-0 text-center text-body-sm text-ink-2" aria-live="polite">
        {q ? (matches.length ? `${index + 1} of ${matches.length}` : "No results") : ""}
      </span>
      <button className="icon-btn h-9 w-9 text-ink" onClick={() => go(1)} disabled={!matches.length} aria-label="Older match">
        <ChevronUp size={20} />
      </button>
      <button className="icon-btn h-9 w-9 text-ink" onClick={() => go(-1)} disabled={!matches.length} aria-label="Newer match">
        <ChevronDown size={20} />
      </button>
      <button className="icon-btn h-9 w-9 text-ink" onClick={onClose} aria-label="Close search">
        <X size={20} />
      </button>
    </header>
  );
}

export function ConversationHeader({ conv, ctx }: { conv: Conversation; ctx: NameContext }) {
  const setDetailsOpen = useUI((s) => s.setDetailsOpen);
  const openModal = useUI((s) => s.openModal);
  const setChatSearch = useUI((s) => s.setChatSearch);
  const [searching, setSearching] = useState(false);
  const subtitle = useSubtitle(conv, ctx);
  const title = conversationTitle(ctx, conv);
  const note = isNoteToSelf(conv, ctx.meId);

  if (searching) {
    return (
      <SearchBar
        conv={conv}
        onClose={() => {
          setSearching(false);
          setChatSearch("");
        }}
      />
    );
  }

  return (
    <header className={BAR}>
      <button className="icon-btn h-9 w-9 text-ink md:hidden" onClick={() => openConversation(null)} aria-label="Back to chats">
        <ArrowLeft size={20} />
      </button>
      <button
        className="flex min-w-0 items-center gap-4 rounded-lg px-2 py-1 text-left hover:bg-hover"
        onClick={() => setDetailsOpen(true)}
        title={conv.kind === "group" ? "Group settings" : "Chat settings"}
      >
        <ConversationAvatar conv={conv} ctx={ctx} size={32} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-semibold leading-5">{title}</span>
            {conv.disappearing_seconds ? (
              <span className="flex shrink-0 items-center gap-0.5 text-body-sm text-ink-2" title={`Disappearing messages: ${timerLabel(conv.disappearing_seconds)}`}>
                <Timer size={13} /> {timerLabel(conv.disappearing_seconds, true)}
              </span>
            ) : null}
          </div>
          {subtitle && <div className="truncate text-body-sm text-ink-2">{subtitle}</div>}
        </div>
      </button>
      <div className="flex-1" />
      {!note && (
        <>
          <button className="icon-btn h-9 w-9 text-ink" onClick={() => comingSoon("Video calls")} aria-label="Video call" title="Video call">
            <Video size={21} strokeWidth={1.7} />
          </button>
          <button className="icon-btn h-9 w-9 text-ink" onClick={() => comingSoon("Voice calls")} aria-label="Voice call" title="Voice call">
            <Phone size={19} strokeWidth={1.7} />
          </button>
        </>
      )}
      <button className="icon-btn h-9 w-9 text-ink" onClick={() => setSearching(true)} aria-label="Search in chat" title="Search in chat">
        <Search size={20} strokeWidth={1.8} />
      </button>
      <Menu
        trigger={({ toggle }) => (
          <button className="icon-btn h-9 w-9 text-ink" onClick={toggle} aria-label="More options">
            <Ellipsis size={22} />
          </button>
        )}
        items={[
          { label: conv.kind === "group" ? "Group settings" : "Chat settings", icon: <Settings2 />, onSelect: () => setDetailsOpen(true) },
          { label: "Disappearing messages", icon: <Timer />, onSelect: () => setDetailsOpen(true), hidden: note || !conv.is_member },
          {
            label: "View safety number",
            icon: <ShieldCheck />,
            onSelect: () => openModal({ kind: "safety-number", convId: conv.id }),
            hidden: conv.kind !== "direct" || note,
          },
          { label: conv.is_pinned ? "Unpin chat" : "Pin chat", icon: conv.is_pinned ? <PinOff /> : <Pin />, onSelect: () => updatePrefs(conv, { is_pinned: !conv.is_pinned }) },
          { label: conv.is_muted ? "Unmute notifications" : "Mute notifications", icon: conv.is_muted ? <Bell /> : <BellOff />, onSelect: () => updatePrefs(conv, { is_muted: !conv.is_muted }) },
          { label: "Archive", icon: <Archive />, onSelect: () => updatePrefs(conv, { is_archived: true }), hidden: conv.is_archived },
          { label: "Leave group", icon: <LogOut />, danger: true, onSelect: () => confirmLeaveGroup(conv), hidden: conv.kind !== "group" || !conv.is_member },
        ]}
      />
    </header>
  );
}
