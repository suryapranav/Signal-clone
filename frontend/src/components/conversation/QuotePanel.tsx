"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";
import { fileUrl } from "@/lib/api";
import { messageSummary, userName, type NameContext } from "@/lib/names";
import type { Message } from "@/lib/types";
import { cx } from "@/lib/utils";

type Quoted = Pick<Message, "sender_id" | "body" | "attachment"> & { deleted?: boolean; deleted_at?: string | null };

/**
 * Signal's quoted message: a rounded panel in the chat's colour with a solid
 * bar down its left edge, the author on top and the text below, plus a
 * thumbnail for photos. Same panel everywhere; inside your own (blue) bubble
 * the bar turns white so it stands out. Colours sampled from Signal Desktop.
 */
export function QuotePanel({
  quoted,
  ctx,
  inOwnBubble = false,
  label,
  onClick,
  onCancel,
  className,
}: {
  quoted: Quoted;
  ctx: NameContext;
  inOwnBubble?: boolean;
  /** Replaces the author line, e.g. "Edit message" in the composer. */
  label?: ReactNode;
  onClick?: () => void;
  /** The composer's × in the panel's corner, to cancel the reply or edit. */
  onCancel?: { label: string; onClick: () => void };
  className?: string;
}) {
  const self = quoted.sender_id === ctx.meId;
  const author = self ? "You" : userName(ctx, quoted.sender_id);
  const deleted = quoted.deleted || !!quoted.deleted_at;
  const photo = !deleted && quoted.attachment?.is_image ? fileUrl(quoted.attachment.url) : null;
  const bar = inOwnBubble ? "bg-white" : "bg-[var(--quote-bar)]";

  const Tag = onClick ? "button" : "div";
  return (
    <div className={cx("relative flex overflow-hidden rounded-lg bg-[var(--quote-bg)] text-[var(--quote-ink)]", className)}>
      <span className={cx("w-1 shrink-0", bar)} aria-hidden />
      <Tag
        {...(onClick ? { onClick, type: "button" as const } : {})}
        className={cx("flex min-w-0 flex-1 items-stretch gap-2 py-2 pl-3 text-left", onCancel ? "pr-9" : "pr-3")}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-semibold leading-5">{label ?? author}</span>
          <span className={cx("line-clamp-2 text-body leading-5", deleted && "italic opacity-80")}>{photo ? quoted.body || "Photo" : messageSummary(quoted)}</span>
        </span>
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element -- small thumbnail served by our API
          <img src={photo} alt="" className="-my-2 -mr-3 h-auto w-12 shrink-0 self-stretch object-cover" />
        )}
      </Tag>
      {onCancel && (
        <button
          type="button"
          className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--quote-x)] text-white"
          onClick={onCancel.onClick}
          aria-label={onCancel.label}
        >
          <X size={13} strokeWidth={2.25} />
        </button>
      )}
    </div>
  );
}
