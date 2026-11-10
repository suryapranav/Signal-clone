"use client";

import { useEffect } from "react";
import { useNames } from "@/hooks/useNames";
import { useChat } from "@/store/chat";
import { Composer } from "./Composer";
import { ConversationHeader } from "./ConversationHeader";
import { MessageList } from "./MessageList";

export function ConversationView({ convId }: { convId: number }) {
  const conv = useChat((s) => s.conversations[convId]);
  const unread = conv?.unread_count ?? 0;
  const ctx = useNames();

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

  if (!conv) return null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ConversationHeader conv={conv} ctx={ctx} />
      <MessageList conv={conv} ctx={ctx} />
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
