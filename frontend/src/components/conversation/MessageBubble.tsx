"use client";

import { Reply, SmilePlus, Timer } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { avatarColor } from "@/lib/colors";
import { bubbleTime, remaining } from "@/lib/format";
import { userName, type NameContext } from "@/lib/names";
import type { Message } from "@/lib/types";
import { cx } from "@/lib/utils";
import { useChat, type UIMessage } from "@/store/chat";
import { useUI } from "@/store/ui";
import { Avatar } from "../ui/Avatar";
import { StatusIcon } from "../ui/StatusIcon";

/** Sender name color: the avatar's saturated tone in light mode, its pastel tone in dark mode. */
function nameColor(key: string) {
  const { fg, bg } = avatarColor(key);
  return `light-dark(${fg}, ${bg})`;
}

export const QUICK_REACTIONS = ["❤️", "👍", "👎", "😂", "😮", "😢"];

const segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;

/** 1–3 emoji and nothing else → shown large without a bubble, like Signal. */
function isJumbomoji(text: string): boolean {
  const t = text.trim();
  if (!t || !/^[\p{Extended_Pictographic}\p{Emoji_Component}‍️\s]+$/u.test(t) || /^[\d#*\s]+$/.test(t)) return false;
  const count = segmenter ? [...segmenter.segment(t.replace(/\s/g, ""))].length : t.length;
  return count <= 3;
}

function ReactionPicker({ onPick, onClose, mine }: { onPick: (e: string) => void; onClose: () => void; mine?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [onClose]);
  return (
    <div ref={ref} className="absolute bottom-full z-30 mb-2 flex animate-pop-in gap-0.5 rounded-full bg-pane p-1 shadow-pop" role="menu" aria-label="React">
      {QUICK_REACTIONS.map((e) => (
        <button
          key={e}
          onClick={() => onPick(e)}
          className={cx("flex h-9 w-9 items-center justify-center rounded-full text-[22px] transition-transform hover:scale-125 hover:bg-hover", mine === e && "bg-selected")}
          aria-label={`React with ${e}`}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

function Quote({ reply, mine, ctx }: { reply: NonNullable<Message["reply_to"]>; mine: boolean; ctx: NameContext }) {
  const focusMessage = useUI((s) => s.focusMessage);
  const author = reply.sender_id === ctx.meId ? "You" : userName(ctx, reply.sender_id);
  return (
    <button
      onClick={() => focusMessage(reply.id)}
      className={cx("mb-1 block w-full min-w-[160px] rounded-lg border-l-[3px] px-2.5 py-1.5 text-left", mine ? "border-white/80 bg-white/20" : "border-ink-2 bg-[color-mix(in_srgb,var(--chat)_60%,transparent)]")}
    >
      <div className="text-[13px] font-semibold leading-4">{author}</div>
      <div className={cx("mt-0.5 line-clamp-2 text-[13px] leading-[18px]", mine ? "text-white/90" : "text-ink-2")}>{reply.body}</div>
    </button>
  );
}

function ReactionPills({ msg, mine, ctx }: { msg: UIMessage; mine: boolean; ctx: NameContext }) {
  const toggle = useChat((s) => s.toggleReaction);
  const groups = new Map<string, number[]>();
  for (const r of msg.reactions) groups.set(r.emoji, [...(groups.get(r.emoji) ?? []), r.user_id]);
  return (
    <div className={cx("relative z-10 -mt-1.5 flex gap-1", mine ? "justify-end pr-2" : "justify-start pl-2")}>
      {[...groups.entries()].map(([emoji, users]) => {
        const byMe = users.includes(ctx.meId);
        return (
          <button
            key={emoji}
            onClick={() => toggle(msg, emoji)}
            title={users.map((u) => (u === ctx.meId ? "You" : userName(ctx, u))).join(", ")}
            className={cx(
              "flex h-6 items-center gap-1 rounded-full border-2 border-chat px-1.5 text-[13px] leading-none",
              byMe ? "bg-[color-mix(in_srgb,var(--accent)_22%,var(--chat))]" : "bg-field",
            )}
          >
            <span>{emoji}</span>
            {users.length > 1 && <span className="text-[11px] font-medium text-ink-2">{users.length}</span>}
          </button>
        );
      })}
    </div>
  );
}

interface BubbleProps {
  msg: UIMessage;
  ctx: NameContext;
  isGroup: boolean;
  canInteract: boolean;
  first: boolean;
  last: boolean;
  now: number;
}

export const MessageBubble = memo(function MessageBubble({ msg, ctx, isGroup, canInteract, first, last, now }: BubbleProps) {
  const mine = msg.sender_id === ctx.meId;
  const [picker, setPicker] = useState(false);
  const setReplyTo = useUI((s) => s.setReplyTo);
  const retry = useChat((s) => s.retry);
  const toggleReaction = useChat((s) => s.toggleReaction);
  const sender = ctx.users[msg.sender_id ?? -1];
  const status = msg.localStatus ?? msg.status ?? "sent";
  const failed = msg.localStatus === "failed";
  const jumbo = !msg.reply_to && isJumbomoji(msg.body);
  const interactive = canInteract && msg.id > 0;
  const myReaction = msg.reactions.find((r) => r.user_id === ctx.meId)?.emoji;

  const radius = mine
    ? cx("rounded-[18px]", !first && "rounded-tr-[4px]", !last && "rounded-br-[4px]")
    : cx("rounded-[18px]", !first && "rounded-tl-[4px]", !last && "rounded-bl-[4px]");

  const actions = interactive && (
    <div className={cx("relative flex shrink-0 items-center self-center opacity-0 transition-opacity group-hover:opacity-100", picker && "opacity-100")}>
      <button className="icon-btn h-7 w-7" onClick={() => setPicker((p) => !p)} aria-label="React">
        <SmilePlus size={16} />
      </button>
      <button className="icon-btn h-7 w-7" onClick={() => setReplyTo(msg)} aria-label="Reply">
        <Reply size={16} />
      </button>
      {picker && (
        <div className={cx("absolute", mine ? "right-0" : "left-0")}>
          <ReactionPicker
            mine={myReaction}
            onClose={() => setPicker(false)}
            onPick={(e) => {
              setPicker(false);
              void toggleReaction(msg, e);
            }}
          />
        </div>
      )}
    </div>
  );

  const meta = (
    <span className={cx("ml-auto flex shrink-0 translate-y-[3px] items-center gap-1 text-[11px] leading-4", jumbo ? "text-ink-2" : mine ? "text-white/80" : "text-ink-2")}>
      {msg.expires_at && (
        <span className="flex items-center gap-0.5" title="Disappearing message">
          <Timer size={11} />
          {remaining(msg.expires_at, now)}
        </span>
      )}
      <span>{bubbleTime(msg.created_at, now)}</span>
      {mine && !failed && <StatusIcon status={status} />}
    </span>
  );

  return (
    <div
      id={`msg-${msg.id}`}
      className={cx("group flex items-end gap-1.5 px-3 md:px-4", mine ? "justify-end" : "justify-start", first ? "mt-2.5" : "mt-0.5")}
    >
      {!mine && isGroup && (
        <div className="w-7 shrink-0">
          {last && sender && <Avatar name={sender.display_name} color={sender.avatar_color} url={sender.avatar_url} size={28} />}
        </div>
      )}
      {mine && actions}
      <div className={cx("flex min-w-0 max-w-[min(78%,520px)] flex-col", mine ? "items-end" : "items-start")}>
        <div
          className={cx(
            "w-fit max-w-full",
            jumbo ? "px-1" : cx("px-3 py-[7px]", radius, mine ? "bg-accent text-white" : "bg-bubble-in text-ink"),
            failed && "opacity-70",
          )}
          style={mine ? { ["--status-bg" as string]: "var(--accent)", ["--status-check" as string]: "var(--accent)" } : undefined}
        >
          {!mine && isGroup && first && sender && (
            <div className="mb-0.5 text-[13px] font-semibold leading-4" style={{ color: nameColor(sender.avatar_color) }}>
              {userName(ctx, sender.id)}
            </div>
          )}
          {msg.reply_to && <Quote reply={msg.reply_to} mine={mine} ctx={ctx} />}
          <div className="flex flex-wrap items-end justify-end gap-x-2">
            <p className={cx("min-w-0 whitespace-pre-wrap text-left [overflow-wrap:anywhere]", jumbo ? "text-[40px] leading-[48px]" : "text-body")}>{msg.body}</p>
            {meta}
          </div>
        </div>
        {msg.reactions.length > 0 && <ReactionPills msg={msg} mine={mine} ctx={ctx} />}
        {failed && (
          <button className="mt-1 text-body-sm font-medium text-danger hover:underline" onClick={() => msg.client_id && retry(msg.conversation_id, msg.client_id)}>
            Not sent. Click to retry.
          </button>
        )}
      </div>
      {!mine && actions}
    </div>
  );
});
