import { MessageCircle } from "lucide-react";

/** Shown while the session is restored and chats load. */
export function Splash() {
  return (
    <div className="flex h-dvh items-center justify-center bg-chat" aria-busy="true" aria-label="Loading">
      <div className="flex h-16 w-16 animate-pulse items-center justify-center rounded-2xl bg-accent text-white">
        <MessageCircle size={34} strokeWidth={2} fill="currentColor" />
      </div>
    </div>
  );
}
