"use client";

import { CircleX, Copy, Download, Ellipsis, FileText, Info, Pencil, Reply, SmilePlus, Timer, Trash2 } from "lucide-react";
import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { fileUrl } from "@/lib/api";
import { avatarColor } from "@/lib/colors";
import { formatBytes } from "@/lib/files";
import { bubbleTime, remaining } from "@/lib/format";
import { userName, type NameContext } from "@/lib/names";
import type { Attachment, Message } from "@/lib/types";
import { cx } from "@/lib/utils";
import { useChat, type UIMessage } from "@/store/chat";
import { toast, useUI } from "@/store/ui";
import { Avatar } from "../ui/Avatar";
import { Menu } from "../ui/Menu";
import { StatusIcon } from "../ui/StatusIcon";
import { QuotePanel } from "./QuotePanel";

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

/** You can edit or delete a message for everyone for this long after sending (the server enforces it too). */
const CHANGE_WINDOW_MS = 24 * 60 * 60 * 1000;

const EDGE = 8; // keep the picker this far from the message list's edges

function ReactionPicker({ onPick, onClose, mine }: { onPick: (e: string) => void; onClose: () => void; mine?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ dx: 0, below: false });

  useEffect(() => {
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose();
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [onClose]);

  // Measure before paint and keep the picker inside the message list, which
  // clips anything outside it. On a phone there's rarely room beside a bubble,
  // so it slides sideways, and flips below the message near the top.
  useLayoutEffect(() => {
    const el = ref.current;
    const bounds = el?.closest("[role=log]")?.getBoundingClientRect();
    if (!el || !bounds) return;
    const r = el.getBoundingClientRect();
    let dx = 0;
    if (r.right > bounds.right - EDGE) dx = bounds.right - EDGE - r.right;
    if (r.left + dx < bounds.left + EDGE) dx = bounds.left + EDGE - r.left;
    setPlace({ dx, below: r.top < bounds.top + EDGE });
  }, []);

  return (
    <div
      ref={ref}
      className={cx("absolute z-30 flex animate-pop-in gap-0.5 rounded-full bg-pane p-1 shadow-pop", place.below ? "top-full mt-2" : "bottom-full mb-2")}
      // `translate` (not `transform`) so it doesn't fight the pop-in animation's scale.
      style={{ translate: `${place.dx}px 0` }}
      role="menu"
      aria-label="React"
    >
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
  return (
    <QuotePanel
      quoted={reply}
      ctx={ctx}
      inOwnBubble={mine}
      onClick={reply.deleted ? undefined : () => focusMessage(reply.id)}
      // 8px in from the bubble's edges (its padding is 12px), as in Signal.
      className="-mx-1 mb-2 mt-0.5 w-[calc(100%+0.5rem)] min-w-[min(200px,100%)]"
    />
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

const MAX_IMAGE_W = 320;
const MAX_IMAGE_H = 380;

/** Display size that keeps the aspect ratio inside 320×380, known before the image loads. */
function imageBox(att: Attachment) {
  const ratio = att.width && att.height ? att.width / att.height : 4 / 3;
  let width = Math.min(MAX_IMAGE_W, att.width ?? MAX_IMAGE_W);
  if (width / ratio > MAX_IMAGE_H) width = MAX_IMAGE_H * ratio;
  return { width: Math.max(120, Math.round(width)), aspectRatio: String(ratio) };
}

/**
 * `alone`: photo with no caption, quote or name, so it fills the bubble.
 * Otherwise it bleeds into the bubble's side padding (negative margins);
 * `flushTop` also pulls it up when nothing sits above it.
 */
function ImageAttachment({ att, alone, flushTop, overlay }: { att: Attachment; alone: boolean; flushTop: boolean; overlay?: ReactNode }) {
  const openModal = useUI((s) => s.openModal);
  const src = fileUrl(att.url);
  return (
    <button
      className={cx(
        "relative block overflow-hidden bg-field",
        alone ? "rounded-[18px]" : cx("-mx-2.5 mb-1.5 rounded-[14px]", flushTop ? "-mt-[4px]" : "mt-1"),
      )}
      // The negative margins widen the available space by 1.25rem, so allow for it.
      style={{ ...imageBox(att), maxWidth: alone ? "100%" : "calc(100% + 1.25rem)" }}
      onClick={() => openModal({ kind: "image", url: src, filename: att.filename })}
      aria-label={`Open image ${att.filename}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- served by our API, sized from stored dimensions */}
      <img src={src} alt={att.filename} className="h-full w-full object-cover" loading="lazy" />
      {alone && (
        <span className="pointer-events-none absolute inset-0 rounded-[18px] border border-[color-mix(in_srgb,var(--ink)_14%,transparent)]" aria-hidden />
      )}
      {overlay && (
        <>
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/45 to-transparent" aria-hidden />
          <span className="absolute bottom-2 right-3 [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]">{overlay}</span>
        </>
      )}
    </button>
  );
}

function FileAttachment({ att, mine }: { att: Attachment; mine: boolean }) {
  return (
    <a
      href={fileUrl(att.url)}
      download={att.filename}
      target="_blank"
      rel="noreferrer"
      className={cx(
        "mb-1 flex min-w-[min(220px,100%)] max-w-full items-center gap-3 rounded-xl px-2 py-1.5",
        mine ? "bg-white/15 hover:bg-white/25" : "bg-[color-mix(in_srgb,var(--chat)_55%,transparent)] hover:bg-chat",
      )}
    >
      <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", mine ? "bg-white/20" : "bg-field")}>
        <FileText size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium leading-[18px]">{att.filename}</span>
        <span className={cx("block text-body-sm", mine ? "text-white/80" : "text-ink-2")}>{formatBytes(att.size)}</span>
      </span>
      <Download size={16} className="shrink-0 opacity-80" />
    </a>
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
  const setEditing = useUI((s) => s.setEditing);
  const deleteForEveryone = useChat((s) => s.deleteForEveryone);
  const retry = useChat((s) => s.retry);
  const toggleReaction = useChat((s) => s.toggleReaction);
  const sender = ctx.users[msg.sender_id ?? -1];
  const status = msg.localStatus ?? msg.status ?? "sent";
  const failed = msg.localStatus === "failed";
  const att = msg.attachment;
  const showName = !mine && isGroup && first && !!sender;
  const imageOnly = !!att?.is_image && !msg.body && !msg.reply_to && !showName;
  const jumbo = !msg.reply_to && !att && isJumbomoji(msg.body);
  const deleted = !!msg.deleted_at;
  const interactive = canInteract && msg.id > 0 && !deleted;
  const changeable = mine && interactive && now - new Date(msg.created_at).getTime() < CHANGE_WINDOW_MS;
  // Touch screens have no hover: a long press opens reactions, as in Signal's mobile app.
  const longPress = useRef<ReturnType<typeof setTimeout>>(undefined);
  const touch = interactive
    ? {
        onTouchStart: () => {
          longPress.current = setTimeout(() => {
            setPicker(true);
            navigator.vibrate?.(10);
          }, 450);
        },
        onTouchEnd: () => clearTimeout(longPress.current),
        onTouchMove: () => clearTimeout(longPress.current),
        onContextMenu: (e: React.MouseEvent) => {
          if (window.matchMedia("(pointer: coarse)").matches) e.preventDefault();
        },
      }
    : {};
  const myReaction = msg.reactions.find((r) => r.user_id === ctx.meId)?.emoji;
  const openModal = useUI((s) => s.openModal);
  const search = useUI((s) => s.chatSearch.trim());

  // Highlight matches while searching in the chat.
  const body =
    search && msg.body.toLowerCase().includes(search.toLowerCase())
      ? msg.body.split(new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi")).map((part, i) =>
          i % 2 ? (
            <mark key={i} className="rounded-[3px] bg-[#ffd75e] text-black">
              {part}
            </mark>
          ) : (
            part
          ),
        )
      : msg.body;

  const radius = mine
    ? cx("rounded-[18px]", !first && "rounded-tr-[4px]", !last && "rounded-br-[4px]")
    : cx("rounded-[18px]", !first && "rounded-tl-[4px]", !last && "rounded-bl-[4px]");

  const actions = interactive && (
    <div
      className={cx(
        "relative flex shrink-0 items-center self-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100",
        mine ? "flex-row" : "flex-row-reverse",
        picker && "opacity-100",
      )}
    >
      <button className="icon-btn h-8 w-8 text-ink" onClick={() => setPicker((p) => !p)} aria-label="React">
        <SmilePlus size={18} strokeWidth={1.7} />
      </button>
      <button className="icon-btn h-8 w-8 text-ink" onClick={() => setReplyTo(msg)} aria-label="Reply">
        <Reply size={18} strokeWidth={1.7} />
      </button>
      <Menu
        align={mine ? "right" : "left"}
        trigger={({ toggle }) => (
          <button className="icon-btn h-8 w-8 text-ink" onClick={toggle} aria-label="More actions">
            <Ellipsis size={20} />
          </button>
        )}
        items={[
          { label: "Reply", icon: <Reply />, onSelect: () => setReplyTo(msg) },
          {
            label: "Copy text",
            icon: <Copy />,
            hidden: !msg.body,
            onSelect: () =>
              navigator.clipboard.writeText(msg.body).then(
                () => toast("Copied to clipboard"),
                () => toast("Couldn't copy", { tone: "error" }),
              ),
          },
          { label: "Edit", icon: <Pencil />, hidden: !changeable, onSelect: () => setEditing(msg) },
          { label: "Message details", icon: <Info />, onSelect: () => openModal({ kind: "message-info", messageId: msg.id }) },
          {
            label: "Delete for everyone",
            icon: <Trash2 />,
            danger: true,
            hidden: !changeable,
            onSelect: () =>
              openModal({
                kind: "confirm",
                title: "Delete for everyone?",
                body: "This message will be deleted for everyone in the chat. They'll see that a message was deleted.",
                confirmLabel: "Delete",
                danger: true,
                onConfirm: () => deleteForEveryone(msg),
              }),
          },
        ]}
      />
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

  // Time, timer and receipt. Over a photo with no caption it sits on the image in white.
  const meta = (
    <span
      className={cx(
        "ml-auto flex shrink-0 items-center gap-1 text-[11px] leading-4",
        imageOnly ? "text-white [--status-bg:transparent] [--status-check:#000]" : "translate-y-[3px]",
        !imageOnly && (jumbo ? "text-ink-2" : mine ? "text-white/80" : "text-ink-2"),
      )}
    >
      {msg.expires_at && (
        <span className="flex items-center gap-0.5" title="Disappearing message">
          <Timer size={11} />
          {remaining(msg.expires_at, now)}
        </span>
      )}
      {msg.edited_at && !deleted && <span title={`Edited ${new Date(msg.edited_at).toLocaleString()}`}>Edited</span>}
      <span>{bubbleTime(msg.created_at, now)}</span>
      {mine && !failed && !deleted && <StatusIcon status={status} />}
    </span>
  );

  if (deleted) {
    // Signal keeps an outlined pill where a message deleted for everyone used to be.
    return (
      <div id={`msg-${msg.id}`} className={cx("flex px-3 md:px-4", mine ? "justify-end" : "justify-start", first ? "mt-2.5" : "mt-0.5")}>
        {!mine && isGroup && <div className="w-7 shrink-0" />}
        <div
          className={cx(
            "flex items-end gap-3 rounded-[18px] border border-[var(--tombstone-border)] py-2 pl-3 pr-3.5 text-ink-2",
            !mine && isGroup && "ml-1.5",
          )}
        >
          <p className="flex items-center gap-1.5 text-body">
            <CircleX size={16} strokeWidth={1.75} className="shrink-0" aria-hidden />
            {mine ? "You deleted this message" : `${userName(ctx, msg.sender_id)} deleted this message`}
          </p>
          <span className="translate-y-[3px] text-[11px] leading-4">{bubbleTime(msg.created_at, now)}</span>
        </div>
      </div>
    );
  }

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
          {...touch}
          className={cx(
            "w-fit max-w-full [-webkit-touch-callout:none]",
            jumbo || imageOnly ? (jumbo ? "px-1" : "") : cx("px-3 py-2", radius, mine ? "bg-accent text-white" : "bg-bubble-in text-ink"),
            failed && "opacity-70",
          )}
          style={mine ? { ["--status-bg" as string]: "var(--accent)", ["--status-check" as string]: "var(--accent)" } : undefined}
        >
          {showName && sender && (
            <div className="mb-0.5 text-[13px] font-semibold leading-4" style={{ color: nameColor(sender.avatar_color) }}>
              {userName(ctx, sender.id)}
            </div>
          )}
          {msg.reply_to && <Quote reply={msg.reply_to} mine={mine} ctx={ctx} />}
          {att &&
            (att.is_image ? (
              <ImageAttachment att={att} alone={imageOnly} flushTop={!showName && !msg.reply_to} overlay={imageOnly ? meta : undefined} />
            ) : (
              <FileAttachment att={att} mine={mine} />
            ))}
          {!imageOnly && (
            <div className="flex flex-wrap items-end justify-end gap-x-2">
              {msg.body && (
                <p className={cx("min-w-0 grow whitespace-pre-wrap text-left [overflow-wrap:anywhere]", jumbo ? "text-[40px] leading-[48px]" : "text-body")}>
                  {body}
                </p>
              )}
              {meta}
            </div>
          )}
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
