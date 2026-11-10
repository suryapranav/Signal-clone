"use client";

import { Archive, ArrowLeft, AtSign, EllipsisVertical, Hash, ListFilter, Search, SquarePen, WifiOff, X } from "lucide-react";
import { useMemo, useState } from "react";
import { sortConversations, startDirectChat } from "@/lib/actions";
import { conversationTitle, isNoteToSelf, userName } from "@/lib/names";
import type { Conversation } from "@/lib/types";
import { cx } from "@/lib/utils";
import { useNames } from "@/hooks/useNames";
import { useNow } from "@/hooks/useNow";
import { useChat } from "@/store/chat";
import { useUI } from "@/store/ui";
import { PaneHeader } from "../shell/Placeholders";
import { Avatar } from "../ui/Avatar";
import { Menu } from "../ui/Menu";
import { ConversationRow } from "./ConversationRow";

export function SearchField({
  value,
  onChange,
  placeholder = "Search",
  id,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  id?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative flex-1">
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
      <input
        id={id}
        className="input h-8 rounded-full pl-9 pr-8"
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onChange("")}
        aria-label={placeholder}
      />
      {value && (
        <button className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-3 hover:text-ink" onClick={() => onChange("")} aria-label="Clear search">
          <X size={14} />
        </button>
      )}
    </div>
  );
}

function matches(text: string | undefined | null, q: string) {
  return !!text && text.toLowerCase().includes(q);
}

export function ChatsPane() {
  const ctx = useNames();
  const now = useNow();
  const conversations = useChat((s) => s.conversations);
  const contactIds = useChat((s) => s.contactIds);
  const activeId = useChat((s) => s.activeId);
  const typing = useChat((s) => s.typing);
  const connection = useChat((s) => s.connection);
  const archivedView = useUI((s) => s.leftMode === "archived");
  const setLeftMode = useUI((s) => s.setLeftMode);
  const openModal = useUI((s) => s.openModal);
  const [query, setQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const q = query.trim().toLowerCase();

  const all = useMemo(() => Object.values(conversations), [conversations]);
  const archivedCount = all.filter((c) => c.is_archived).length;

  const list = useMemo(() => {
    let convs = all.filter((c) => (q ? true : c.is_archived === archivedView));
    if (unreadOnly) convs = convs.filter((c) => c.unread_count > 0);
    if (q) {
      convs = convs.filter(
        (c) =>
          matches(conversationTitle(ctx, c), q) ||
          (c.kind === "group" && c.members.some((m) => matches(userName(ctx, m.user.id), q))),
      );
    }
    return sortConversations(convs);
  }, [all, archivedView, unreadOnly, q, ctx]);

  // While searching, also offer contacts you don't have a 1:1 chat with yet.
  const contactResults = useMemo(() => {
    if (!q) return [];
    const withChat = new Set(
      all.filter((c) => c.kind === "direct" && !isNoteToSelf(c, ctx.meId)).flatMap((c) => c.members.map((m) => m.user.id)),
    );
    return contactIds
      .filter((id) => !withChat.has(id))
      .map((id) => ctx.users[id])
      .filter((u) => u && (matches(userName(ctx, u.id), q) || matches(u.username, q) || u.phone.includes(q.replace(/[\s-]/g, ""))));
  }, [q, all, contactIds, ctx]);

  const isTyping = (c: Conversation) => Object.keys(typing[c.id] ?? {}).length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {archivedView ? (
        <header className="flex h-14 shrink-0 items-center gap-2 px-2">
          <button className="icon-btn" onClick={() => setLeftMode("list")} aria-label="Back to chats">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-body-lg font-semibold">Archived chats</h1>
        </header>
      ) : (
        <PaneHeader title="Chats">
          <button className="icon-btn" title="New chat (Ctrl+Alt+N)" aria-label="New chat" onClick={() => setLeftMode("compose")}>
            <SquarePen size={18} />
          </button>
          <Menu
            trigger={({ toggle }) => (
              <button className="icon-btn" onClick={toggle} aria-label="More options">
                <EllipsisVertical size={18} />
              </button>
            )}
            items={[
              { label: "Find by phone number", icon: <Hash />, onSelect: () => openModal({ kind: "find-user", by: "phone" }) },
              { label: "Find by username", icon: <AtSign />, onSelect: () => openModal({ kind: "find-user", by: "username" }) },
              { label: `Archived chats${archivedCount ? ` (${archivedCount})` : ""}`, icon: <Archive />, onSelect: () => setLeftMode("archived") },
            ]}
          />
        </PaneHeader>
      )}

      {connection === "offline" && (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg bg-field px-3 py-2 text-body-sm text-ink-2" role="status">
          <WifiOff size={14} /> Disconnected. Reconnecting…
        </div>
      )}

      <div className="flex items-center gap-2 px-4 pb-3">
        <SearchField id="chat-search" value={query} onChange={setQuery} />
        <button
          className={cx("icon-btn h-8 w-8", unreadOnly && "bg-accent text-white hover:bg-accent-hover hover:text-white")}
          onClick={() => setUnreadOnly((v) => !v)}
          title="Filter by unread"
          aria-label="Filter by unread"
          aria-pressed={unreadOnly}
        >
          <ListFilter size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-3">
        {q && list.length > 0 && <div className="section-label">Chats</div>}
        {list.map((c) => (
          <ConversationRow key={c.id} conv={c} ctx={ctx} active={c.id === activeId} typing={isTyping(c)} now={now} highlight={q || undefined} />
        ))}

        {contactResults.length > 0 && (
          <>
            <div className="section-label">Contacts</div>
            {contactResults.map((u) => (
              <button key={u.id} className="row mx-2 w-[calc(100%-1rem)] rounded-xl py-2.5" onClick={() => startDirectChat(u.id)}>
                <Avatar name={u.display_name} color={u.avatar_color} url={u.avatar_url} size={48} online={u.online} />
                <div className="min-w-0">
                  <div className="truncate font-medium">{userName(ctx, u.id)}</div>
                  <div className="truncate text-body-sm text-ink-2">{u.about || u.username || ""}</div>
                </div>
              </button>
            ))}
          </>
        )}

        {list.length === 0 && contactResults.length === 0 && (
          <div className="px-8 py-12 text-center text-body text-ink-2">
            {q ? (
              <>
                No results for &ldquo;{query}&rdquo;
                <button className="mt-3 block w-full text-accent hover:underline" onClick={() => openModal({ kind: "find-user", by: /^[+\d]/.test(q) ? "phone" : "username" })}>
                  Find someone new
                </button>
              </>
            ) : unreadOnly ? (
              "No unread chats"
            ) : archivedView ? (
              "No archived chats"
            ) : (
              "No chats yet. Start one with the pencil above."
            )}
          </div>
        )}

        {!q && !archivedView && !unreadOnly && archivedCount > 0 && (
          <button className="row mx-2 mt-1 w-[calc(100%-1rem)] rounded-xl py-3 text-ink-2" onClick={() => setLeftMode("archived")}>
            <span className="flex h-12 w-12 items-center justify-center">
              <Archive size={20} />
            </span>
            <span className="flex-1 font-medium">Archived chats</span>
            <span className="text-body-sm">{archivedCount}</span>
          </button>
        )}
      </div>
    </div>
  );
}
