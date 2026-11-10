"use client";

import { Lock } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { useChat } from "@/store/chat";
import { useSession } from "@/store/session";
import { AvatarPicker } from "../settings/AvatarPicker";
import { OnboardingFrame } from "./Onboarding";

/** Shown after first verification: Signal asks for a name before anything else. */
export function ProfileSetup() {
  const me = useChat((s) => s.me)!;
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [color, setColor] = useState(me.avatar_color);
  const [photo, setPhoto] = useState<string | null>(me.avatar_url);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const name = `${first.trim()} ${last.trim()}`.trim();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const user = await api.updateMe({ display_name: name, avatar_color: color, avatar_url: photo ?? "" });
      useChat.getState().setMe(user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your profile");
      setBusy(false);
    }
  }

  return (
    <OnboardingFrame onBack={() => useSession.getState().signOut()}>
      <h1 className="text-title font-semibold">Set up your profile</h1>
      <p className="mt-2 text-body text-ink-2">
        Your profile is visible to people you message, contacts and groups.
      </p>

      <form onSubmit={submit} className="mt-8">
        <AvatarPicker name={name} color={color} photo={photo} onColor={setColor} onPhoto={setPhoto} />
        <div className="mt-6 space-y-3">
          <input className="input" placeholder="First name (required)" value={first} onChange={(e) => setFirst(e.target.value)} autoFocus maxLength={40} aria-label="First name" />
          <input className="input" placeholder="Last name (optional)" value={last} onChange={(e) => setLast(e.target.value)} maxLength={40} aria-label="Last name" />
        </div>
        <p className="mt-4 flex items-center gap-2 text-body-sm text-ink-2">
          <Lock size={14} /> Your profile is end-to-end encrypted.
        </p>
        {error && <p className="mt-3 text-body-sm text-danger">{error}</p>}
        <div className="flex justify-end pt-8">
          <button className="btn-primary min-w-24" disabled={!first.trim() || busy}>
            Next
          </button>
        </div>
      </form>
    </OnboardingFrame>
  );
}
