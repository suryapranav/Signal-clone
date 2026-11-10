"use client";

import { Menu as MenuIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/lib/utils";
import { useChat } from "@/store/chat";
import { useUI, type Tab } from "@/store/ui";
import { ChatBubbleIcon, GearIcon, PhoneIcon, StoriesIcon } from "../ui/icons";

function NavButton({
  tab,
  label,
  icon,
  badge,
  expanded,
}: {
  tab: Tab;
  label: string;
  icon: (active: boolean) => ReactNode;
  badge?: number;
  expanded: boolean;
}) {
  const active = useUI((s) => s.tab === tab);
  const setTab = useUI((s) => s.setTab);
  return (
    <button
      onClick={() => setTab(tab)}
      title={expanded ? undefined : label}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cx(
        "relative flex h-10 shrink-0 items-center rounded-xl transition-colors",
        expanded ? "w-full gap-3 px-[18px]" : "w-[58px] justify-center",
        active ? "bg-selected text-ink" : "text-ink hover:bg-hover",
      )}
    >
      {icon(active)}
      {expanded && <span className={cx("text-body", active && "font-semibold")}>{label}</span>}
      {!!badge && (
        <span
          className={cx(
            "flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-semibold text-white",
            expanded ? "ml-auto" : "absolute right-2 top-0",
          )}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

/** Signal Desktop's left column: menu toggle, Chats / Calls / Stories, settings at the foot. */
export function NavRail() {
  const expanded = useUI((s) => s.navExpanded);
  const toggleNav = useUI((s) => s.toggleNav);
  const unread = useChat((s) =>
    Object.values(s.conversations).reduce((n, c) => n + (c.is_muted || c.is_archived ? 0 : c.unread_count), 0),
  );

  return (
    <nav
      className={cx(
        "flex shrink-0 flex-col gap-1 border-r border-line bg-rail pb-4 pt-3 transition-[width] duration-150",
        expanded ? "w-[200px] items-stretch px-2.5" : "w-16 items-center px-[3px] md:w-20 md:px-2.5",
      )}
      aria-label="Main"
    >
      <button
        className={cx("mb-3 flex h-10 items-center rounded-xl text-ink hover:bg-hover", expanded ? "w-full px-[18px]" : "w-[58px] justify-center")}
        onClick={toggleNav}
        aria-label={expanded ? "Collapse menu" : "Expand menu"}
        aria-expanded={expanded}
      >
        <MenuIcon size={22} strokeWidth={1.7} />
      </button>
      <NavButton tab="chats" label="Chats" icon={(a) => <ChatBubbleIcon filled={a} size={22} strokeWidth={1.7} />} badge={unread} expanded={expanded} />
      <NavButton tab="calls" label="Calls" icon={(a) => <PhoneIcon filled={a} size={21} strokeWidth={1.7} />} expanded={expanded} />
      <NavButton tab="stories" label="Stories" icon={() => <StoriesIcon size={22} strokeWidth={1.7} />} expanded={expanded} />
      <div className="flex-1" />
      <NavButton tab="settings" label="Settings" icon={(a) => <GearIcon filled={a} size={22} strokeWidth={1.7} />} expanded={expanded} />
    </nav>
  );
}
