import { create } from "zustand";
import type { Message } from "@/lib/types";
import type { OutgoingFile } from "./chat";
import { uid } from "@/lib/utils";

export type Tab = "chats" | "calls" | "stories" | "settings";
export type LeftMode = "list" | "archived" | "compose" | "new-group";
export type Theme = "system" | "light" | "dark";
export type SettingsSection = "profile" | "appearance" | "chats" | "notifications" | "privacy" | "devices";

export type Modal =
  | { kind: "find-user"; by: "phone" | "username" }
  | { kind: "add-members"; convId: number }
  | { kind: "edit-group"; convId: number }
  | { kind: "safety-number"; convId: number }
  | { kind: "coming-soon"; feature: string }
  | { kind: "shortcuts" }
  | { kind: "image"; url: string; filename: string }
  | {
      kind: "confirm";
      title: string;
      body: string;
      confirmLabel: string;
      danger?: boolean;
      onConfirm: () => void | Promise<void>;
    };

export interface Toast {
  id: string;
  text: string;
  tone: "default" | "error";
  action?: { label: string; onClick: () => void };
}

interface UIState {
  tab: Tab;
  leftMode: LeftMode;
  detailsOpen: boolean;
  modal: Modal | null;
  toasts: Toast[];
  theme: Theme;
  /** Message being replied to in the open conversation. */
  replyTo: Message | null;
  /** Message to scroll to and highlight (from clicking a quote). */
  focusMessageId: number | null;
  /** Open settings page; null = the section list (on mobile). */
  settingsSection: SettingsSection | null;
  /** File attached in the composer but not sent yet (picked, pasted or dropped). */
  pendingFile: { convId: number; file: OutgoingFile } | null;

  setTab(tab: Tab): void;
  setLeftMode(mode: LeftMode): void;
  setDetailsOpen(open: boolean): void;
  openModal(modal: Modal): void;
  closeModal(): void;
  toast(text: string, opts?: { tone?: Toast["tone"]; action?: Toast["action"]; ms?: number }): void;
  dismissToast(id: string): void;
  setTheme(theme: Theme): void;
  setReplyTo(message: Message | null): void;
  focusMessage(id: number | null): void;
  setSettingsSection(section: SettingsSection | null): void;
  setPendingFile(pending: { convId: number; file: OutgoingFile } | null): void;
  reset(): void;
}

const THEME_KEY = "signal.theme";

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
}

function storedTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

const initial = {
  tab: "chats" as Tab,
  leftMode: "list" as LeftMode,
  detailsOpen: false,
  modal: null,
  toasts: [],
  replyTo: null,
  focusMessageId: null,
  settingsSection: null as SettingsSection | null,
  pendingFile: null,
};

export const useUI = create<UIState>((set, get) => ({
  ...initial,
  theme: typeof window === "undefined" ? "system" : storedTheme(),

  setTab: (tab) => set({ tab, leftMode: "list" }),
  setLeftMode: (leftMode) => set({ leftMode }),
  setDetailsOpen: (detailsOpen) => set({ detailsOpen }),
  openModal: (modal) => set({ modal }),
  closeModal: () => set({ modal: null }),

  toast: (text, opts = {}) => {
    const id = uid();
    set({ toasts: [...get().toasts.slice(-2), { id, text, tone: opts.tone ?? "default", action: opts.action }] });
    setTimeout(() => get().dismissToast(id), opts.ms ?? 4000);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  setTheme: (theme) => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* not persisted in private mode */
    }
    applyTheme(theme);
    set({ theme });
  },

  setReplyTo: (replyTo) => set({ replyTo }),
  focusMessage: (focusMessageId) => set({ focusMessageId }),
  setSettingsSection: (settingsSection) => set({ settingsSection }),
  setPendingFile: (pendingFile) => set({ pendingFile }),
  reset: () => set(initial),
}));

export const toast = (...args: Parameters<UIState["toast"]>) => useUI.getState().toast(...args);
