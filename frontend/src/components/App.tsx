"use client";

import { useCallback, useEffect } from "react";
import { api, ApiError } from "@/lib/api";
import { useRealtime } from "@/hooks/useRealtime";
import { useChat } from "@/store/chat";
import { useSession } from "@/store/session";
import { toast } from "@/store/ui";
import { AppShell } from "./shell/AppShell";
import { Onboarding } from "./onboarding/Onboarding";
import { ProfileSetup } from "./onboarding/ProfileSetup";
import { Splash } from "./shell/Splash";
import { Toasts } from "./ui/Toasts";

/** Top-level state machine: signed out → profile setup → app. */
export default function App() {
  const { token, hydrated, hydrate } = useSession();
  const me = useChat((s) => s.me);

  useEffect(hydrate, [hydrate]);

  // Restore the session: who am I?
  useEffect(() => {
    if (!token || useChat.getState().me) return;
    api
      .me()
      .then((user) => useChat.getState().setMe(user))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) void useSession.getState().signOut(false);
        else toast("Can't reach the server. Retrying…", { tone: "error" });
      });
  }, [token]);

  let screen;
  if (!hydrated || (token && !me)) screen = <Splash />;
  else if (!token) screen = <Onboarding />;
  else if (!me!.display_name) screen = <ProfileSetup />;
  else screen = <SignedIn token={token} />;

  return (
    <>
      {screen}
      <Toasts />
    </>
  );
}

function SignedIn({ token }: { token: string }) {
  const ready = useChat((s) => s.ready);
  const onUnauthorized = useCallback(() => void useSession.getState().signOut(false), []);
  useRealtime(token, onUnauthorized);

  useEffect(() => {
    useChat.getState().bootstrap().catch(() => toast("Couldn't load your chats", { tone: "error" }));
  }, []);

  return ready ? <AppShell /> : <Splash />;
}
