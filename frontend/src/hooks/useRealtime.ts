import { useEffect } from "react";
import { conversationTitle, firstName, messageSummary } from "@/lib/names";
import { getPref } from "@/lib/prefs";
import { realtime } from "@/lib/socket";
import type { ServerEvent } from "@/lib/types";
import { useChat } from "@/store/chat";
import { toast, useUI } from "@/store/ui";

/** In-app notification for a message arriving in a chat you're not looking at. */
function maybeNotify(event: ServerEvent) {
  if (event.type !== "message.new" || event.message.kind !== "text") return;
  if (!getPref("notify-messages", true)) return;
  const s = useChat.getState();
  const msg = event.message;
  const conv = s.conversations[msg.conversation_id];
  if (!conv || !s.me || msg.sender_id === s.me.id || conv.is_muted) return;
  const viewing = s.activeId === conv.id && useUI.getState().tab === "chats" && !document.hidden;
  if (viewing) return;
  const ctx = { meId: s.me.id, users: s.users, nicknames: s.nicknames };
  const who = conv.kind === "group" ? `${firstName(ctx, msg.sender_id)} in ${conversationTitle(ctx, conv)}` : conversationTitle(ctx, conv);
  const body = getPref("notify-preview", true) ? (messageSummary(msg).length > 60 ? messageSummary(msg).slice(0, 60) + "…" : messageSummary(msg)) : "New message";
  toast(`${who}: ${body}`, {
    action: {
      label: "View",
      onClick: () => {
        useUI.getState().setTab("chats");
        useChat.getState().open(conv.id);
      },
    },
  });
}

/** Keeps the signed-in user's WebSocket open and feeds events into the store. */
export function useRealtime(token: string, onUnauthorized: () => void) {
  useEffect(() => {
    const chat = useChat.getState();
    realtime.connect(token, {
      onEvent: (event) => {
        maybeNotify(event);
        useChat.getState().applyEvent(event);
      },
      onState: (state) => chat.setConnection(state),
      onResync: () => {
        // We may have missed events while offline: refetch the list and the open chat.
        const { refreshConversations, activeId, loadThread } = useChat.getState();
        refreshConversations().catch(() => {});
        if (activeId != null) loadThread(activeId).catch(() => {});
      },
      onUnauthorized,
    });
    const prune = setInterval(() => useChat.getState().pruneTyping(), 2000);
    return () => {
      clearInterval(prune);
      realtime.disconnect();
    };
  }, [token, onUnauthorized]);

  // Unread total in the tab title, like the desktop app's badge.
  useEffect(
    () =>
      useChat.subscribe((s) => {
        const unread = Object.values(s.conversations).reduce((n, c) => n + (c.is_muted ? 0 : c.unread_count), 0);
        document.title = unread ? `(${unread}) Signal Clone` : "Signal Clone";
      }),
    [],
  );
}
