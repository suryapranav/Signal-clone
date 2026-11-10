// Cross-store actions used by several components.

import { api, ApiError } from "./api";
import { useChat } from "@/store/chat";
import { toast, useUI } from "@/store/ui";
import type { Conversation } from "./types";

/** Chat list order: pinned first, then most recent activity. */
export function sortConversations(convs: Conversation[]): Conversation[] {
  return [...convs].sort(
    (a, b) => Number(b.is_pinned) - Number(a.is_pinned) || b.last_activity_at.localeCompare(a.last_activity_at),
  );
}

/** The chats currently shown in the list (archived view or main view). */
export function visibleConversations(archived: boolean): Conversation[] {
  return sortConversations(Object.values(useChat.getState().conversations).filter((c) => c.is_archived === archived));
}

export function openConversation(id: number | null) {
  const ui = useUI.getState();
  useUI.setState({
    tab: "chats",
    leftMode: ui.leftMode === "archived" ? "archived" : "list",
    detailsOpen: false,
    replyTo: null,
  });
  useChat.getState().open(id);
}

export async function startDirectChat(userId: number) {
  try {
    const conv = await api.openDirect(userId);
    useChat.getState().upsertConversation(conv);
    openConversation(conv.id);
  } catch (e) {
    toast(e instanceof ApiError ? e.message : "Couldn't open that chat", { tone: "error" });
  }
}

export async function updatePrefs(conv: Conversation, prefs: Partial<Pick<Conversation, "is_pinned" | "is_archived" | "is_muted">>) {
  const store = useChat.getState();
  store.upsertConversation({ ...conv, ...prefs }); // optimistic
  try {
    store.upsertConversation(await api.updatePrefs(conv.id, prefs));
  } catch {
    store.upsertConversation(conv);
    toast("Couldn't update the chat", { tone: "error" });
    return;
  }
  if (prefs.is_archived) {
    if (store.activeId === conv.id) openConversation(null);
    toast("Chat archived", { action: { label: "Undo", onClick: () => updatePrefs({ ...conv, is_archived: true }, { is_archived: false }) } });
  } else if (prefs.is_archived === false) toast("Chat unarchived");
  else if (prefs.is_pinned !== undefined) toast(prefs.is_pinned ? "Chat pinned" : "Chat unpinned");
  else if (prefs.is_muted !== undefined) toast(prefs.is_muted ? "Notifications muted" : "Notifications unmuted");
}

export function comingSoon(feature: string) {
  useUI.getState().openModal({ kind: "coming-soon", feature });
}
