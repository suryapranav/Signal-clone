"use client";

import { CircleDashed, Lock, MessageCircle, Phone, PhoneCall, Plus } from "lucide-react";
import { comingSoon } from "@/lib/actions";
import { useChat } from "@/store/chat";
import type { Tab } from "@/store/ui";
import { Avatar } from "../ui/Avatar";

export function PaneHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="flex h-[60px] shrink-0 items-center justify-between pl-6 pr-3">
      <h1 className="text-[20px] font-bold">{title}</h1>
      <div className="flex items-center gap-1">{children}</div>
    </header>
  );
}

/** Right pane when no chat is open. */
export function EmptyChatPane() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-field text-ink-3">
        <MessageCircle size={40} strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-body-lg font-medium text-ink">Select a chat to start messaging</p>
        <p className="mt-1 text-body-sm text-ink-2">
          Press <kbd className="rounded bg-field px-1.5 py-0.5 font-sans">Ctrl K</kbd> to search, or{" "}
          <kbd className="rounded bg-field px-1.5 py-0.5 font-sans">Ctrl /</kbd> for shortcuts.
        </p>
      </div>
      <p className="mt-6 flex items-center gap-1.5 text-body-sm text-ink-3">
        <Lock size={13} /> Your messages are end-to-end encrypted
      </p>
    </div>
  );
}

/** Left pane for the Calls and Stories tabs. */
export function PlaceholderList({ tab }: { tab: Exclude<Tab, "chats" | "settings"> }) {
  const me = useChat((s) => s.me)!;
  if (tab === "calls") {
    return (
      <>
        <PaneHeader title="Calls">
          <button className="icon-btn" title="New call" aria-label="New call" onClick={() => comingSoon("Voice and video calls")}>
            <PhoneCall size={18} />
          </button>
        </PaneHeader>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center text-ink-2">
          <Phone size={28} strokeWidth={1.5} />
          <p className="text-body">No recent calls</p>
          <p className="text-body-sm text-ink-3">Voice and video calls are coming soon.</p>
        </div>
      </>
    );
  }
  return (
    <>
      <PaneHeader title="Stories">
        <button className="icon-btn" title="Add a story" aria-label="Add a story" onClick={() => comingSoon("Stories")}>
          <Plus size={20} />
        </button>
      </PaneHeader>
      <div className="px-2">
        <button className="row" onClick={() => comingSoon("Stories")}>
          <div className="relative">
            <Avatar name={me.display_name} color={me.avatar_color} url={me.avatar_url} size={48} />
            <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-pane bg-accent text-white">
              <Plus size={12} strokeWidth={3} />
            </span>
          </div>
          <div>
            <div className="font-semibold">My Stories</div>
            <div className="text-body-sm text-ink-2">Tap to add</div>
          </div>
        </button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center text-ink-2">
        <CircleDashed size={28} strokeWidth={1.5} />
        <p className="text-body-sm text-ink-3">Stories are coming soon.</p>
      </div>
    </>
  );
}

export function ComingSoonPane({ tab }: { tab: "calls" | "stories" }) {
  const Icon = tab === "calls" ? Phone : CircleDashed;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-field text-ink-3">
        <Icon size={38} strokeWidth={1.5} />
      </div>
      <p className="text-body-lg font-medium">{tab === "calls" ? "Calls" : "Stories"}</p>
      <p className="text-body-sm text-ink-2">Coming soon</p>
    </div>
  );
}
