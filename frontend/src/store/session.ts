import { create } from "zustand";
import { api, tokenStore } from "@/lib/api";
import { setPrefsOwner } from "@/lib/prefs";
import { realtime } from "@/lib/socket";
import { useChat } from "./chat";
import { useUI } from "./ui";

interface SessionState {
  token: string | null;
  hydrated: boolean;
  hydrate(): void;
  signIn(token: string): void;
  /** Clear everything locally; `revoke` also deletes the session server-side. */
  signOut(revoke?: boolean): Promise<void>;
}

export const useSession = create<SessionState>((set) => ({
  token: null,
  hydrated: false,
  hydrate: () => set({ token: tokenStore.get(), hydrated: true }),
  signIn: (token) => {
    tokenStore.set(token);
    set({ token });
  },
  signOut: async (revoke = true) => {
    if (revoke) await api.logout().catch(() => {});
    tokenStore.set(null);
    realtime.disconnect();
    useChat.getState().reset();
    useUI.getState().reset();
    setPrefsOwner(null);
    useUI.getState().loadUserTheme(); // back to System on the sign-in screen
    set({ token: null });
  },
}));
