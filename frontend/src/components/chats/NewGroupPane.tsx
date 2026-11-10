"use client";

import { ArrowLeft, Check, X } from "lucide-react";
import { useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { openConversation } from "@/lib/actions";
import { userName } from "@/lib/names";
import type { AvatarColor, User } from "@/lib/types";
import { cx } from "@/lib/utils";
import { useNames } from "@/hooks/useNames";
import { useChat } from "@/store/chat";
import { toast, useUI } from "@/store/ui";
import { AvatarPicker } from "../settings/AvatarPicker";
import { Avatar } from "../ui/Avatar";
import { SearchField } from "./ChatsPane";

/** Contact list with checkboxes; reused when adding members to a group. */
export function ContactPicker({
  selected,
  onToggle,
  exclude = [],
}: {
  selected: number[];
  onToggle: (id: number) => void;
  exclude?: number[];
}) {
  const ctx = useNames();
  const contactIds = useChat((s) => s.contactIds);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const contacts = useMemo(
    () =>
      contactIds
        .filter((id) => !exclude.includes(id))
        .map((id) => ctx.users[id])
        .filter((u): u is User => !!u && (!q || userName(ctx, u.id).toLowerCase().includes(q)))
        .sort((a, b) => userName(ctx, a.id).localeCompare(userName(ctx, b.id))),
    [contactIds, exclude, ctx, q],
  );

  return (
    <>
      <div className="px-4 pb-2">
        <SearchField value={query} onChange={setQuery} placeholder="Search contacts" autoFocus />
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2">
          {selected.map((id) => (
            <button key={id} className="flex items-center gap-1.5 rounded-full bg-field py-1 pl-1 pr-2 text-body-sm hover:bg-selected" onClick={() => onToggle(id)}>
              <Avatar name={userName(ctx, id)} color={ctx.users[id]?.avatar_color ?? "A110"} url={ctx.users[id]?.avatar_url} size={20} />
              {userName(ctx, id).split(" ")[0]}
              <X size={12} />
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {contacts.map((u) => {
          const on = selected.includes(u.id);
          return (
            <button key={u.id} className="row mx-2 w-[calc(100%-1rem)] rounded-xl py-2" onClick={() => onToggle(u.id)} role="checkbox" aria-checked={on}>
              <Avatar name={u.display_name} color={u.avatar_color} url={u.avatar_url} size={40} />
              <span className="min-w-0 flex-1 truncate font-medium">{userName(ctx, u.id)}</span>
              <span className={cx("flex h-5 w-5 items-center justify-center rounded-full border-2", on ? "border-accent bg-accent text-white" : "border-ink-3")}>
                {on && <Check size={12} strokeWidth={3} />}
              </span>
            </button>
          );
        })}
        {contacts.length === 0 && <p className="px-6 py-8 text-center text-body text-ink-2">No contacts to add</p>}
      </div>
    </>
  );
}

/** Two steps, as in Signal: pick members, then name the group. */
export function NewGroupPane() {
  const setLeftMode = useUI((s) => s.setLeftMode);
  const ctx = useNames();
  const [step, setStep] = useState<"members" | "name">("members");
  const [members, setMembers] = useState<number[]>([]);
  const [title, setTitle] = useState("");
  const [color, setColor] = useState<AvatarColor>("A140");
  const [busy, setBusy] = useState(false);

  const toggle = (id: number) => setMembers((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  async function create() {
    setBusy(true);
    try {
      const conv = await api.createGroup(title.trim(), members, color);
      useChat.getState().upsertConversation(conv);
      setLeftMode("list");
      openConversation(conv.id);
      toast("Group created");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't create the group", { tone: "error" });
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-[60px] shrink-0 items-center gap-2 px-2">
        <button className="icon-btn" onClick={() => (step === "name" ? setStep("members") : setLeftMode("compose"))} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-body-lg font-semibold">{step === "members" ? "Add group members" : "Name this group"}</h1>
      </header>

      {step === "members" ? (
        <>
          <ContactPicker selected={members} onToggle={toggle} />
          <div className="flex justify-end border-t border-line p-3">
            <button className="btn-primary" disabled={members.length === 0} onClick={() => setStep("name")}>
              Next
            </button>
          </div>
        </>
      ) : (
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) void create();
          }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4">
            <AvatarPicker name={title} color={color} photo={null} onColor={setColor} variant="group" />
            <input className="input mt-6" placeholder="Group name (required)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={64} autoFocus aria-label="Group name" />
            <div className="section-label px-0 pt-6">Members · {members.length + 1}</div>
            <div className="space-y-1">
              {members.map((id) => (
                <div key={id} className="flex items-center gap-3 py-1.5">
                  <Avatar name={userName(ctx, id)} color={ctx.users[id]?.avatar_color ?? "A110"} url={ctx.users[id]?.avatar_url} size={32} />
                  <span className="text-body">{userName(ctx, id)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end border-t border-line p-3">
            <button className="btn-primary" disabled={!title.trim() || busy}>
              Create
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
