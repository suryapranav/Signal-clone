"use client";

import { Archive, ArchiveRestore, BellOff, Bell, ChevronDown, MailOpen, Pin, PinOff } from "lucide-react";
import { memo } from "react";
import { openConversation, updatePrefs } from "@/lib/actions";
import { listTime } from "@/lib/format";
import { conversationTitle, previewText, type NameContext } from "@/lib/names";
import type { Conversation } from "@/lib/types";
import { cx } from "@/lib/utils";
import { useChat } from "@/store/chat";
import { ConversationAvatar } from "../ui/Avatar";
import { Menu } from "../ui/Menu";
import { StatusIcon } from "../ui/StatusIcon";
import { TypingDots } from "../ui/TypingDots";

interface Props {
  conv: Conversation;
  ctx: NameContext;
  active: boolean;
  typing: boolean;
  now: number;
  /** Highlight this part of the title (search results). */
  highlight?: string;
}

function Highlight({ text, query }: { text: string; query?: string }) {
  if (!query) return <>{text}</>;
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-transparent font-bold text-ink">{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  );
}

export const ConversationRow = memo(function ConversationRow({ conv, ctx, active, typing, now, highlight }: Props) {
  const title = conversationTitle(ctx, conv);
  const last = conv.last_message;
  const mine = last && last.sender_id === ctx.meId && last.kind === "text";
  const unread = conv.unread_count > 0;
  const status = mine ? ((last as { localStatus?: "sending" | "failed" }).localStatus ?? last.status ?? "sent") : null;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={active ? "true" : undefined}
      onClick={() => openConversation(conv.id)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openConversation(conv.id)}
      className={cx(
        "group relative mx-2.5 flex cursor-pointer items-center gap-3 rounded-xl px-3.5 py-3 outline-none transition-colors",
        active ? "bg-selected" : "hover:bg-hover focus-visible:bg-hover",
      )}
      style={{
        ["--status-bg" as string]: active ? "var(--selected)" : "var(--pane)",
        ["--status-check" as string]: active ? "var(--selected)" : "var(--pane)",
      }}
    >
      <ConversationAvatar conv={conv} ctx={ctx} size={48} showPresence />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1">
            <span className={cx("truncate text-[15px] leading-5", unread ? "font-bold" : "font-semibold")}>
              <Highlight text={title} query={highlight} />
            </span>
            {conv.is_muted && <BellOff size={13} className="shrink-0 text-ink-3" aria-label="Muted" />}
          </span>
          {last && (
            <span className={cx("shrink-0 text-[13px] leading-5", unread ? "font-semibold text-ink" : "text-ink-2")}>
              {listTime(last.created_at, now)}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className={cx("flex min-w-0 flex-1 items-center gap-1 text-body", unread ? "text-ink" : "text-ink-2")}>
            {typing ? (
              <TypingDots className="py-1.5 text-ink-3" />
            ) : (
              <>
                {status && status !== "failed" && <StatusIcon status={status} className="shrink-0 text-ink-2" />}
                {status === "failed" && <span className="text-danger">Not sent ·</span>}
                <span className="line-clamp-1 break-all">{previewText(ctx, conv, last)}</span>
              </>
            )}
          </span>
          {conv.is_pinned && !unread && <Pin size={13} className="shrink-0 rotate-45 text-ink-3" aria-label="Pinned" />}
          {unread && (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">
              {conv.unread_count}
            </span>
          )}
        </div>
      </div>

      {/* Hover menu, like Signal's chevron on each row */}
      <div className="absolute right-3 top-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
        <Menu
          trigger={({ toggle }) => (
            <button className="flex h-6 w-6 items-center justify-center rounded-full bg-pane text-ink-2 shadow hover:text-ink" onClick={toggle} aria-label="Chat options">
              <ChevronDown size={14} />
            </button>
          )}
          items={[
            { label: conv.is_pinned ? "Unpin chat" : "Pin chat", icon: conv.is_pinned ? <PinOff /> : <Pin />, onSelect: () => updatePrefs(conv, { is_pinned: !conv.is_pinned }) },
            { label: "Mark as read", icon: <MailOpen />, onSelect: () => useChat.getState().markRead(conv.id), hidden: !unread },
            { label: conv.is_muted ? "Unmute notifications" : "Mute notifications", icon: conv.is_muted ? <Bell /> : <BellOff />, onSelect: () => updatePrefs(conv, { is_muted: !conv.is_muted }) },
            {
              label: conv.is_archived ? "Unarchive" : "Archive",
              icon: conv.is_archived ? <ArchiveRestore /> : <Archive />,
              onSelect: () => updatePrefs(conv, { is_archived: !conv.is_archived }),
            },
          ]}
        />
      </div>
    </div>
  );
});
