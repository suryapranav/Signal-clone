"use client";

import { ArrowLeft, AtSign, Hash, Search, Users } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import { startDirectChat } from "@/lib/actions";
import { userName } from "@/lib/names";
import { useNames } from "@/hooks/useNames";
import { useChat } from "@/store/chat";
import { toast, useUI } from "@/store/ui";
import { Avatar } from "../ui/Avatar";
import { SearchField } from "./ChatsPane";

export function ActionRow({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="row mx-2 w-[calc(100%-1rem)] rounded-xl py-2" onClick={onClick}>
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-field text-ink">{icon}</span>
      <span className="font-medium">{label}</span>
    </button>
  );
}

/** Phone numbers or Signal-style usernames typed into a search box. */
export function looksLikeIdentifier(q: string) {
  return /^\+?[\d\s-]{6,}$/.test(q) || /^@?[a-z][a-z0-9_]{2,}\.\d{2,}$/i.test(q);
}

/** Signal's "New chat" screen: replaces the chat list until you pick someone. */
export function ComposePane() {
  const ctx = useNames();
  const contactIds = useChat((s) => s.contactIds);
  const setLeftMode = useUI((s) => s.setLeftMode);
  const openModal = useUI((s) => s.openModal);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const contacts = useMemo(
    () =>
      contactIds
        .map((id) => ctx.users[id])
        .filter(Boolean)
        .filter((u) => !q || userName(ctx, u.id).toLowerCase().includes(q) || u.username?.includes(q) || u.phone.includes(q.replace(/[\s-]/g, "")))
        .sort((a, b) => userName(ctx, a.id).localeCompare(userName(ctx, b.id))),
    [contactIds, ctx, q],
  );
  const me = ctx.users[ctx.meId];
  const showNote = !q || "note to self".includes(q);

  async function findAndOpen() {
    try {
      const user = await api.lookupUser(query.trim());
      await startDirectChat(user.id);
      setLeftMode("list");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't look that up", { tone: "error" });
    }
  }

  const open = async (userId: number) => {
    await startDirectChat(userId);
    setLeftMode("list");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 px-2">
        <button className="icon-btn" onClick={() => setLeftMode("list")} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-body-lg font-semibold">New chat</h1>
      </header>
      <div className="px-4 pb-3">
        <SearchField value={query} onChange={setQuery} placeholder="Name, username or number" autoFocus />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-3">
        {!q && (
          <>
            <ActionRow icon={<Users size={18} />} label="New group" onClick={() => setLeftMode("new-group")} />
            <ActionRow icon={<AtSign size={18} />} label="Find by username" onClick={() => openModal({ kind: "find-user", by: "username" })} />
            <ActionRow icon={<Hash size={18} />} label="Find by phone number" onClick={() => openModal({ kind: "find-user", by: "phone" })} />
          </>
        )}
        {q && looksLikeIdentifier(q) && <ActionRow icon={<Search size={18} />} label={`Find “${query.trim()}”`} onClick={findAndOpen} />}

        {(contacts.length > 0 || showNote) && <div className="section-label">Contacts</div>}
        {showNote && me && (
          <button className="row mx-2 w-[calc(100%-1rem)] rounded-xl py-2" onClick={() => open(me.id)}>
            <Avatar name="Note to Self" color={me.avatar_color} size={40} variant="note" />
            <span className="font-medium">Note to Self</span>
          </button>
        )}
        {contacts.map((u) => (
          <button key={u.id} className="row mx-2 w-[calc(100%-1rem)] rounded-xl py-2" onClick={() => open(u.id)}>
            <Avatar name={u.display_name} color={u.avatar_color} url={u.avatar_url} size={40} />
            <div className="min-w-0">
              <div className="truncate font-medium">{userName(ctx, u.id)}</div>
              {u.about && <div className="truncate text-body-sm text-ink-2">{u.about}</div>}
            </div>
          </button>
        ))}
        {q && contacts.length === 0 && !looksLikeIdentifier(q) && (
          <p className="px-6 py-8 text-center text-body text-ink-2">No contacts found. Try a phone number or username.</p>
        )}
      </div>
    </div>
  );
}
