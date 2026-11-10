"use client";

import { ImagePlus } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { useNames } from "@/hooks/useNames";
import { useChat } from "@/store/chat";
import { attachFile, Composer } from "./Composer";
import { ConversationHeader } from "./ConversationHeader";
import { MessageList } from "./MessageList";

export function ConversationView({ convId }: { convId: number }) {
  const conv = useChat((s) => s.conversations[convId]);
  const unread = conv?.unread_count ?? 0;
  const ctx = useNames();
  // Captured before the read effect below clears it: where the "unread messages" divider goes.
  const [unreadAtOpen] = useState(() => useChat.getState().conversations[convId]?.unread_count ?? 0);

  // Opening a chat (or receiving a message while it's on screen) marks it read.
  useEffect(() => {
    const markIfVisible = () => document.visibilityState === "visible" && useChat.getState().markRead(convId);
    markIfVisible();
    document.addEventListener("visibilitychange", markIfVisible);
    window.addEventListener("focus", markIfVisible);
    return () => {
      document.removeEventListener("visibilitychange", markIfVisible);
      window.removeEventListener("focus", markIfVisible);
    };
  }, [convId, unread]);

  // Drag a file anywhere onto the chat to attach it (counter handles child elements).
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes("Files");
  const dropProps = conv?.is_member
    ? {
        onDragEnter: (e: DragEvent) => {
          if (!hasFiles(e)) return;
          depth.current += 1;
          setDragging(true);
        },
        onDragLeave: () => {
          depth.current = Math.max(0, depth.current - 1);
          if (depth.current === 0) setDragging(false);
        },
        onDragOver: (e: DragEvent) => hasFiles(e) && e.preventDefault(),
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          depth.current = 0;
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void attachFile(convId, file);
        },
      }
    : {};

  if (!conv) return null;

  return (
    <div className="relative flex h-full min-h-0 flex-col" {...dropProps}>
      {dragging && (
        <div className="pointer-events-none absolute inset-3 z-30 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-accent bg-[color-mix(in_srgb,var(--chat)_85%,transparent)] text-accent">
          <ImagePlus size={32} />
          <span className="font-medium">Drop to attach</span>
        </div>
      )}
      <ConversationHeader conv={conv} ctx={ctx} />
      <MessageList conv={conv} ctx={ctx} unreadAtOpen={unreadAtOpen} />
      {conv.is_member ? (
        <Composer conv={conv} ctx={ctx} />
      ) : (
        <p className="shrink-0 border-t border-line px-6 py-4 text-center text-body-sm text-ink-2">
          You can&apos;t send messages to this group because you&apos;re no longer a member.
        </p>
      )}
    </div>
  );
}
