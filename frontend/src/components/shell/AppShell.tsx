"use client";

import { useEffect } from "react";
import { openConversation, visibleConversations } from "@/lib/actions";
import { cx } from "@/lib/utils";
import { useChat } from "@/store/chat";
import { useUI } from "@/store/ui";
import { ChatsPane } from "../chats/ChatsPane";
import { ComposePane } from "../chats/ComposePane";
import { NewGroupPane } from "../chats/NewGroupPane";
import { ConversationView } from "../conversation/ConversationView";
import { ConversationDetails } from "../details/ConversationDetails";
import { Modals } from "../modals/Modals";
import { SettingsContent, SettingsNav } from "../settings/Settings";
import { ComingSoonPane, EmptyChatPane, PlaceholderList } from "./Placeholders";
import { NavRail } from "./NavRail";

/** Keyboard shortcuts (also listed in the shortcuts dialog, Ctrl+/). */
function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const ui = useUI.getState();
      if (ui.modal) return;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ui.setTab("chats");
        setTimeout(() => document.getElementById("chat-search")?.focus());
      } else if (mod && e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        ui.setTab("chats");
        ui.setLeftMode("compose");
      } else if (mod && e.key === "/") {
        e.preventDefault();
        ui.openModal({ kind: "shortcuts" });
      } else if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        const list = visibleConversations(ui.leftMode === "archived");
        if (list.length === 0) return;
        const i = list.findIndex((c) => c.id === useChat.getState().activeId);
        const next = e.key === "ArrowDown" ? Math.min(list.length - 1, i + 1) : Math.max(0, i - 1);
        openConversation(list[i === -1 ? 0 : next].id);
      } else if (e.key === "Escape" && ui.detailsOpen) {
        ui.setDetailsOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export function AppShell() {
  const tab = useUI((s) => s.tab);
  const leftMode = useUI((s) => s.leftMode);
  const detailsOpen = useUI((s) => s.detailsOpen);
  const settingsSection = useUI((s) => s.settingsSection);
  const activeId = useChat((s) => s.activeId);
  const activeExists = useChat((s) => s.activeId != null && !!s.conversations[s.activeId]);
  useShortcuts();

  // On narrow screens only one pane is visible: the list or the open item.
  const mainOpen = (tab === "chats" && activeExists) || (tab === "settings" && settingsSection !== null);

  let left;
  if (tab === "chats") {
    left = leftMode === "compose" ? <ComposePane /> : leftMode === "new-group" ? <NewGroupPane /> : <ChatsPane />;
  } else if (tab === "settings") left = <SettingsNav />;
  else left = <PlaceholderList tab={tab} />;

  let main;
  if (tab === "chats") {
    if (!activeExists) main = <EmptyChatPane />;
    else if (detailsOpen) main = <ConversationDetails key={activeId} convId={activeId!} />;
    else main = <ConversationView key={activeId} convId={activeId!} />;
  } else if (tab === "settings") main = <SettingsContent />;
  else main = <ComingSoonPane tab={tab} />;

  return (
    <div className="flex h-dvh overflow-hidden bg-chat">
      <div className={cx("flex min-w-0 shrink-0 md:flex", mainOpen ? "hidden" : "flex w-full md:w-auto")}>
        <NavRail />
        <aside className="flex w-full min-w-0 flex-col border-r border-line bg-pane md:w-[320px] lg:w-[340px]">{left}</aside>
      </div>
      <main className={cx("min-w-0 flex-1 flex-col bg-chat md:flex", mainOpen ? "flex" : "hidden")}>{main}</main>
      <Modals />
    </div>
  );
}
