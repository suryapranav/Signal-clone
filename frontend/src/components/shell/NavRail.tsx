"use client";

import { CircleDashed, MessageCircle, Phone, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/lib/utils";
import { useChat } from "@/store/chat";
import { useUI, type Tab } from "@/store/ui";
import { Avatar } from "../ui/Avatar";

function NavButton({ tab, label, icon, badge }: { tab: Tab; label: string; icon: ReactNode; badge?: number }) {
  const active = useUI((s) => s.tab === tab);
  const setTab = useUI((s) => s.setTab);
  return (
    <button
      onClick={() => setTab(tab)}
      title={label}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cx(
        "relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors",
        active ? "bg-selected text-ink" : "text-ink-2 hover:bg-hover hover:text-ink",
      )}
    >
      {icon}
      {!!badge && (
        <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-semibold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

/** Signal Desktop's narrow left column: Chats / Calls / Stories, then settings and profile. */
export function NavRail() {
  const me = useChat((s) => s.me)!;
  const unread = useChat((s) =>
    Object.values(s.conversations).reduce((n, c) => n + (c.is_muted || c.is_archived ? 0 : c.unread_count), 0),
  );
  const openProfile = () => {
    useUI.getState().setTab("settings");
    useUI.getState().setSettingsSection("profile");
  };

  return (
    <nav className="flex w-[68px] shrink-0 flex-col items-center gap-1 border-r border-line bg-rail py-3" aria-label="Main">
      <NavButton tab="chats" label="Chats" icon={<MessageCircle size={22} strokeWidth={1.75} />} badge={unread} />
      <NavButton tab="calls" label="Calls" icon={<Phone size={21} strokeWidth={1.75} />} />
      <NavButton tab="stories" label="Stories" icon={<CircleDashed size={22} strokeWidth={1.75} />} />
      <div className="flex-1" />
      <NavButton tab="settings" label="Settings" icon={<Settings size={22} strokeWidth={1.75} />} />
      <button onClick={openProfile} className="mt-2 rounded-full" title="Profile" aria-label="Profile">
        <Avatar name={me.display_name} color={me.avatar_color} url={me.avatar_url} size={32} />
      </button>
    </nav>
  );
}
