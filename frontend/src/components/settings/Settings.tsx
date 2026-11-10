"use client";

import { ArrowLeft, Bell, ChevronRight, Keyboard, Laptop, Lock, LogOut, MessageSquare, Monitor, Moon, Palette, Sun } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import { formatPhone } from "@/lib/format";
import { usePref } from "@/lib/prefs";
import type { AvatarColor } from "@/lib/types";
import { cx } from "@/lib/utils";
import { useChat } from "@/store/chat";
import { useSession } from "@/store/session";
import { toast, useUI, type SettingsSection, type Theme } from "@/store/ui";
import { PaneHeader } from "../shell/Placeholders";
import { Avatar } from "../ui/Avatar";
import { SwitchRow } from "../ui/Switch";
import { AvatarPicker } from "./AvatarPicker";

const SECTIONS: { id: SettingsSection; label: string; icon: ReactNode }[] = [
  { id: "appearance", label: "Appearance", icon: <Palette size={20} /> },
  { id: "chats", label: "Chats", icon: <MessageSquare size={20} /> },
  { id: "notifications", label: "Notifications", icon: <Bell size={20} /> },
  { id: "privacy", label: "Privacy", icon: <Lock size={20} /> },
  { id: "devices", label: "Linked devices", icon: <Laptop size={20} /> },
];

export function SettingsNav() {
  const me = useChat((s) => s.me)!;
  const section = useUI((s) => s.settingsSection);
  const setSection = useUI((s) => s.setSettingsSection);
  const openModal = useUI((s) => s.openModal);
  const active = section ?? "profile";

  const item = (id: SettingsSection, label: string, icon: ReactNode) => (
    <button
      key={id}
      onClick={() => setSection(id)}
      className={cx("row mx-2 w-[calc(100%-1rem)] rounded-xl py-2.5", active === id && "md:bg-selected")}
    >
      <span className="text-ink-2">{icon}</span>
      <span className="flex-1">{label}</span>
      <ChevronRight size={16} className="text-ink-3 md:hidden" />
    </button>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PaneHeader title="Settings" />
      <div className="min-h-0 flex-1 overflow-y-auto pb-3">
        <button
          onClick={() => setSection("profile")}
          className={cx("row mx-2 mb-2 w-[calc(100%-1rem)] rounded-xl py-3", active === "profile" && "md:bg-selected")}
        >
          <Avatar name={me.display_name} color={me.avatar_color} url={me.avatar_url} size={48} />
          <div className="min-w-0">
            <div className="truncate font-semibold">{me.display_name}</div>
            <div className="truncate text-body-sm text-ink-2">{formatPhone(me.phone)}</div>
          </div>
        </button>
        {SECTIONS.map((s) => item(s.id, s.label, s.icon))}
        <div className="mx-4 my-2 border-t border-line" />
        <button className="row mx-2 w-[calc(100%-1rem)] rounded-xl py-2.5" onClick={() => openModal({ kind: "shortcuts" })}>
          <Keyboard size={20} className="text-ink-2" />
          <span>Keyboard shortcuts</span>
        </button>
        <button
          className="row mx-2 w-[calc(100%-1rem)] rounded-xl py-2.5 text-danger"
          onClick={() =>
            openModal({
              kind: "confirm",
              title: "Log out?",
              body: "You'll need to verify your phone number again to sign back in on this device.",
              confirmLabel: "Log out",
              danger: true,
              onConfirm: () => useSession.getState().signOut(),
            })
          }
        >
          <LogOut size={20} />
          <span>Log out</span>
        </button>
      </div>
    </div>
  );
}

function Page({ title, children }: { title: string; children: ReactNode }) {
  const setSection = useUI((s) => s.setSettingsSection);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-[60px] shrink-0 items-center gap-2 border-b border-line px-2 md:px-6">
        <button className="icon-btn md:hidden" onClick={() => setSection(null)} aria-label="Back to settings">
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-semibold">{title}</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl px-6 py-6">{children}</div>
      </div>
    </div>
  );
}

function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      {title && <h2 className="mb-1 text-body-sm font-semibold text-ink-2">{title}</h2>}
      <div className="divide-y divide-line">{children}</div>
    </section>
  );
}

function ProfilePage() {
  const me = useChat((s) => s.me)!;
  const [name, setName] = useState(me.display_name);
  const [about, setAbout] = useState(me.about);
  const [username, setUsername] = useState(me.username ?? "");
  const [color, setColor] = useState<AvatarColor>(me.avatar_color);
  const [photo, setPhoto] = useState<string | null>(me.avatar_url);
  const [busy, setBusy] = useState(false);
  const dirty =
    name !== me.display_name || about !== me.about || username !== (me.username ?? "") || color !== me.avatar_color || photo !== me.avatar_url;

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const user = await api.updateMe({ display_name: name, about, username, avatar_color: color, avatar_url: photo ?? "" });
      useChat.getState().setMe(user);
      toast("Profile updated");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't save your profile", { tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="Profile">
      <form onSubmit={save} className="space-y-5">
        <AvatarPicker name={name} color={color} photo={photo} onColor={setColor} onPhoto={setPhoto} />
        <label className="block">
          <span className="mb-1 block text-body-sm font-semibold text-ink-2">Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} />
        </label>
        <label className="block">
          <span className="mb-1 block text-body-sm font-semibold text-ink-2">About</span>
          <input className="input" value={about} onChange={(e) => setAbout(e.target.value)} maxLength={140} placeholder="Write a few words about yourself" />
        </label>
        <label className="block">
          <span className="mb-1 block text-body-sm font-semibold text-ink-2">Username</span>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} placeholder="name.42" maxLength={36} />
          <span className="mt-1 block text-body-sm text-ink-3">People can find you by your username without seeing your phone number.</span>
        </label>
        <div>
          <span className="mb-1 block text-body-sm font-semibold text-ink-2">Phone number</span>
          <p className="text-body text-ink">{formatPhone(me.phone)}</p>
        </div>
        <div className="flex justify-end">
          <button className="btn-primary" disabled={!dirty || !name.trim() || busy}>
            Save
          </button>
        </div>
      </form>
    </Page>
  );
}

function AppearancePage() {
  const theme = useUI((s) => s.theme);
  const setTheme = useUI((s) => s.setTheme);
  const options: { id: Theme; label: string; icon: ReactNode }[] = [
    { id: "system", label: "System", icon: <Monitor size={22} /> },
    { id: "light", label: "Light", icon: <Sun size={22} /> },
    { id: "dark", label: "Dark", icon: <Moon size={22} /> },
  ];
  return (
    <Page title="Appearance">
      <Group title="Theme">
        <div className="grid grid-cols-3 gap-3 py-3" role="radiogroup" aria-label="Theme">
          {options.map((o) => (
            <button
              key={o.id}
              role="radio"
              aria-checked={theme === o.id}
              onClick={() => setTheme(o.id)}
              className={cx(
                "flex flex-col items-center gap-2 rounded-xl border-2 py-4 transition-colors",
                theme === o.id ? "border-accent bg-field" : "border-line hover:bg-hover",
              )}
            >
              {o.icon}
              <span className="text-body">{o.label}</span>
            </button>
          ))}
        </div>
      </Group>
    </Page>
  );
}

function ChatsPage() {
  const [previews, setPreviews] = usePref("link-previews", true);
  const [spell, setSpell] = usePref("spell-check", true);
  const [enterSends, setEnterSends] = usePref("enter-sends", true);
  return (
    <Page title="Chats">
      <Group>
        <SwitchRow title="Generate link previews" description="Retrieve link previews directly from websites." checked={previews} onChange={setPreviews} />
        <SwitchRow title="Spell check" checked={spell} onChange={setSpell} />
        <SwitchRow title="Enter key sends" description="Use Shift + Enter for a new line." checked={enterSends} onChange={setEnterSends} disabled />
      </Group>
    </Page>
  );
}

function NotificationsPage() {
  const [messages, setMessages] = usePref("notify-messages", true);
  const [sound, setSound] = usePref("notify-sound", true);
  const [preview, setPreview] = usePref("notify-preview", true);
  return (
    <Page title="Notifications">
      <Group title="Messages">
        <SwitchRow title="Show notifications" description="In-app toasts when a message arrives in another chat." checked={messages} onChange={setMessages} />
        <SwitchRow title="Notification sound" checked={sound} onChange={setSound} />
        <SwitchRow title="Show name and message" checked={preview} onChange={setPreview} />
      </Group>
    </Page>
  );
}

function PrivacyPage() {
  const [receipts, setReceipts] = usePref("read-receipts", true);
  const [typing, setTyping] = usePref("typing-indicators", true);
  return (
    <Page title="Privacy">
      <Group title="Messaging">
        <SwitchRow title="Read receipts" description="Always on in this demo, so you can see the receipt flow." checked={receipts} onChange={setReceipts} disabled />
        <SwitchRow title="Typing indicators" description="Always on in this demo." checked={typing} onChange={setTyping} disabled />
      </Group>
      <Group title="Disappearing messages">
        <p className="py-3 text-body text-ink-2">Set a timer for each chat from its chat settings.</p>
      </Group>
      <Group title="Blocked">
        <p className="py-3 text-body text-ink-2">No blocked contacts.</p>
      </Group>
    </Page>
  );
}

function DevicesPage() {
  return (
    <Page title="Linked devices">
      <div className="flex flex-col items-center gap-3 py-12 text-center text-ink-2">
        <Laptop size={40} strokeWidth={1.5} />
        <p className="text-body-lg font-medium text-ink">Linked devices are coming soon</p>
        <p className="text-body-sm">Use Signal on your desktop and tablet, synced with your phone.</p>
      </div>
    </Page>
  );
}

export function SettingsContent() {
  const section = useUI((s) => s.settingsSection) ?? "profile";
  switch (section) {
    case "profile":
      return <ProfilePage />;
    case "appearance":
      return <AppearancePage />;
    case "chats":
      return <ChatsPage />;
    case "notifications":
      return <NotificationsPage />;
    case "privacy":
      return <PrivacyPage />;
    case "devices":
      return <DevicesPage />;
  }
}
