"use client";

import { Archive, ArrowLeft, Bell, BellOff, Ellipsis, LogOut, Phone, Pin, PinOff, Settings2, ShieldCheck, Timer, Video } from "lucide-react";
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

export function ConversationHeader({ conv, ctx }: { conv: Conversation; ctx: NameContext }) {
  const setDetailsOpen = useUI((s) => s.setDetailsOpen);
  const openModal = useUI((s) => s.openModal);
  const subtitle = useSubtitle(conv, ctx);
  const title = conversationTitle(ctx, conv);
  const note = isNoteToSelf(conv, ctx.meId);

  return (
    <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line px-2 md:px-3">
      <button className="icon-btn md:hidden" onClick={() => openConversation(null)} aria-label="Back to chats">
        <ArrowLeft size={20} />
      </button>
      <button
        className="flex min-w-0 items-center gap-3 rounded-lg px-1.5 py-1 text-left hover:bg-hover"
        onClick={() => setDetailsOpen(true)}
        title={conv.kind === "group" ? "Group settings" : "Chat settings"}
      >
        <ConversationAvatar conv={conv} ctx={ctx} size={32} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-semibold">{title}</span>
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
          <button className="icon-btn h-9 w-9" onClick={() => comingSoon("Video calls")} aria-label="Video call" title="Video call">
            <Video size={20} strokeWidth={1.75} />
          </button>
          <button className="icon-btn h-9 w-9" onClick={() => comingSoon("Voice calls")} aria-label="Voice call" title="Voice call">
            <Phone size={18} strokeWidth={1.75} />
          </button>
        </>
      )}
      <Menu
        trigger={({ toggle }) => (
          <button className="icon-btn h-9 w-9" onClick={toggle} aria-label="More options">
            <Ellipsis size={20} />
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
