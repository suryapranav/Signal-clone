"use client";

import { Download, Rocket, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api, ApiError } from "@/lib/api";
import { startDirectChat } from "@/lib/actions";
import { formatPhone, fullDateTime } from "@/lib/format";
import { userKey } from "@/lib/prefs";
import { directPeer, userName } from "@/lib/names";
import type { AvatarColor, MessageInfo, User } from "@/lib/types";
import { useNames } from "@/hooks/useNames";
import { useChat } from "@/store/chat";
import { toast, useUI, type Modal as ModalState } from "@/store/ui";
import { ContactPicker } from "../chats/NewGroupPane";
import { AvatarPicker } from "../settings/AvatarPicker";
import { Avatar } from "../ui/Avatar";
import { StatusIcon } from "../ui/StatusIcon";
import { Switch } from "../ui/Switch";
import { Modal } from "../ui/Modal";

type Of<K extends ModalState["kind"]> = Extract<ModalState, { kind: K }>;

function FindUserModal({ by, onClose }: Of<"find-user"> & { onClose: () => void }) {
  const contactIds = useChat((s) => s.contactIds);
  const [query, setQuery] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function lookup(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setUser(null);
    try {
      setUser(await api.lookupUser(query.trim()));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't look that up");
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!user) return;
    try {
      useChat.getState().addContact(await api.addContact(user.phone));
      toast(`${user.display_name} added to contacts`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't add contact", { tone: "error" });
    }
  }

  return (
    <Modal title={by === "phone" ? "Find by phone number" : "Find by username"} onClose={onClose}>
      <form onSubmit={lookup} className="flex gap-2">
        <input
          className="input"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={by === "phone" ? "+1 555 010 0004" : "rahul.04"}
          inputMode={by === "phone" ? "tel" : "text"}
          aria-label={by === "phone" ? "Phone number" : "Username"}
        />
        <button className="btn-primary" disabled={busy || query.trim().length < 3}>
          Find
        </button>
      </form>
      {error && <p className="mt-3 text-body-sm text-danger">{error}</p>}
      {user && (
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-field p-3">
          <Avatar name={user.display_name} color={user.avatar_color} url={user.avatar_url} size={44} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{user.display_name}</div>
            <div className="truncate text-body-sm text-ink-2">{user.username ? `@${user.username}` : formatPhone(user.phone)}</div>
          </div>
        </div>
      )}
      {user && (
        <div className="mt-4 flex justify-end gap-2">
          {!contactIds.includes(user.id) && user.id !== useChat.getState().me?.id && (
            <button className="btn-secondary" onClick={add}>
              Add to contacts
            </button>
          )}
          <button
            className="btn-primary"
            onClick={async () => {
              onClose();
              useUI.getState().setLeftMode("list");
              await startDirectChat(user.id);
            }}
          >
            Message
          </button>
        </div>
      )}
    </Modal>
  );
}

function AddMembersModal({ convId, onClose }: Of<"add-members"> & { onClose: () => void }) {
  const conv = useChat((s) => s.conversations[convId]);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const exclude = useMemo(() => conv?.members.map((m) => m.user.id) ?? [], [conv]);

  async function add() {
    setBusy(true);
    try {
      useChat.getState().upsertConversation(await api.addMembers(convId, selected));
      toast(selected.length === 1 ? "Member added" : `${selected.length} members added`);
      onClose();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't add members", { tone: "error" });
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Add members"
      onClose={onClose}
      bare={false}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={!selected.length || busy} onClick={add}>
            Add{selected.length ? ` (${selected.length})` : ""}
          </button>
        </>
      }
    >
      <div className="-mx-5 flex h-[50vh] flex-col">
        <ContactPicker selected={selected} exclude={exclude} onToggle={(id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))} />
      </div>
    </Modal>
  );
}

function EditGroupModal({ convId, onClose }: Of<"edit-group"> & { onClose: () => void }) {
  const conv = useChat((s) => s.conversations[convId])!;
  const [title, setTitle] = useState(conv.title ?? "");
  const [description, setDescription] = useState(conv.description);
  const [color, setColor] = useState<AvatarColor>(conv.avatar_color);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      useChat.getState().upsertConversation(await api.updateConversation(convId, { title: title.trim(), description: description.trim(), avatar_color: color }));
      toast("Group updated");
      onClose();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Couldn't update group", { tone: "error" });
      setBusy(false);
    }
  }

  return (
    <Modal title="Edit group" onClose={onClose}>
      <form onSubmit={save} className="space-y-3 pt-2">
        <AvatarPicker name={title} color={color} photo={null} onColor={setColor} variant="group" />
        <input className="input mt-4" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Group name" maxLength={64} aria-label="Group name" />
        <textarea className="input h-20 resize-none py-2" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" maxLength={480} aria-label="Description" />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={!title.trim() || busy}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Deterministic 60-digit "safety number" for a pair of users (simulated). */
function safetyNumber(a: User, b: User): string[] {
  const [x, y] = [a, b].sort((p, q) => p.id - q.id);
  let seed = 0;
  for (const ch of `${x.phone}|${y.phone}`) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const blocks: string[] = [];
  for (let i = 0; i < 12; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    blocks.push(String(seed % 100000).padStart(5, "0"));
  }
  return blocks;
}

function SafetyNumberModal({ convId, onClose }: Of<"safety-number"> & { onClose: () => void }) {
  const ctx = useNames();
  const conv = useChat((s) => s.conversations[convId]);
  const me = useChat((s) => s.me)!;
  const peer = conv && directPeer(conv, me.id);
  const key = userKey(`verified.${convId}`); // your own verification, not whoever used this browser before
  const [verified, setVerified] = useState(false);
  useEffect(() => {
    try {
      setVerified(localStorage.getItem(key) === "1");
    } catch {}
  }, [key]);
  if (!peer) return null;
  const blocks = safetyNumber(me, peer);

  return (
    <Modal title="Safety number" onClose={onClose}>
      <div className="flex flex-col items-center gap-4 pt-2 text-center">
        <ShieldCheck size={36} className="text-accent" />
        <div className="grid grid-cols-4 gap-x-4 gap-y-2 rounded-xl bg-field px-5 py-4 font-mono text-[15px] tracking-wider">
          {blocks.map((b, i) => (
            <span key={i}>{b}</span>
          ))}
        </div>
        <p className="text-body-sm text-ink-2">
          To verify end-to-end encryption with {userName(ctx, peer.id)}, compare the numbers above with their device. This demo simulates encryption.
        </p>
        <label className="flex w-full items-center justify-between rounded-xl bg-field px-4 py-3">
          <span>Mark as verified</span>
          <Switch
            checked={verified}
            label="Mark as verified"
            onChange={(v) => {
              setVerified(v);
              try {
                localStorage.setItem(key, v ? "1" : "0");
              } catch {}
            }}
          />
        </label>
      </div>
    </Modal>
  );
}

/** Signal's "Message details": when it was sent, and who has received / read it. */
function MessageInfoModal({ messageId, onClose }: { messageId: number; onClose: () => void }) {
  const ctx = useNames();
  const [info, setInfo] = useState<MessageInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.messageInfo(messageId).then(setInfo, (e) => setError(e instanceof ApiError ? e.message : "Couldn't load details"));
  }, [messageId]);

  const groups = info
    ? ([
        ["Read by", "read", info.receipts.filter((r) => r.read_at)],
        ["Delivered to", "delivered", info.receipts.filter((r) => r.delivered_at && !r.read_at)],
        ["Sent to", "sent", info.receipts.filter((r) => !r.delivered_at)],
      ] as const)
    : [];

  return (
    <Modal title="Message details" onClose={onClose}>
      {error && <p className="text-body text-danger">{error}</p>}
      {!info && !error && <p className="py-6 text-center text-body text-ink-2">Loading…</p>}
      {info && (
        <div className="space-y-5 pb-1">
          <p className="text-body">
            <span className="text-ink-2">Sent </span>
            {fullDateTime(info.sent_at)}
          </p>
          {info.receipts.length === 0 && <p className="text-body text-ink-2">No other recipients.</p>}
          {groups.map(([title, status, rows]) =>
            rows.length ? (
              <section key={title}>
                <h3 className="mb-1 flex items-center gap-2 text-body-sm font-semibold text-ink-2">
                  <StatusIcon status={status} className="text-ink-2" /> {title}
                </h3>
                {rows.map((r) => (
                  <div key={r.user.id} className="flex items-center gap-3 py-1.5">
                    <Avatar name={r.user.display_name} color={r.user.avatar_color} url={r.user.avatar_url} size={32} />
                    <span className="min-w-0 flex-1 truncate">{r.user.id === ctx.meId ? "You" : userName(ctx, r.user.id)}</span>
                    <span className="shrink-0 text-body-sm text-ink-2">
                      {r.read_at ? fullDateTime(r.read_at) : r.delivered_at ? fullDateTime(r.delivered_at) : "Not yet delivered"}
                    </span>
                  </div>
                ))}
              </section>
            ) : null,
          )}
        </div>
      )}
    </Modal>
  );
}

/** Full-screen photo viewer, closed by Esc, the X, or clicking the backdrop. */
function ImageViewer({ url, filename, onClose }: { url: string; filename: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-label={filename}>
      <div className="flex items-center justify-between gap-4 px-4 py-3 text-white">
        <span className="truncate text-body">{filename}</span>
        <div className="flex items-center gap-1">
          <a href={url} download={filename} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10" aria-label="Download">
            <Download size={20} />
          </a>
          <button className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-4 pt-0" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        {/* eslint-disable-next-line @next/next/no-img-element -- full-size attachment */}
        <img src={url} alt={filename} className="max-h-full max-w-full animate-pop-in object-contain" />
      </div>
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ["Ctrl / ⌘ + K", "Search chats"],
  ["Ctrl / ⌘ + Alt + N", "New chat"],
  ["Alt + ↑ / ↓", "Previous / next chat"],
  ["Enter", "Send message"],
  ["Shift + Enter", "New line"],
  ["Esc", "Cancel reply, close panel or dialog"],
  ["Ctrl / ⌘ + /", "Show keyboard shortcuts"],
];

export function Modals() {
  const modal = useUI((s) => s.modal);
  const close = useUI((s) => s.closeModal);
  const [busy, setBusy] = useState(false);
  if (!modal) return null;

  switch (modal.kind) {
    case "find-user":
      return <FindUserModal {...modal} onClose={close} />;
    case "add-members":
      return <AddMembersModal {...modal} onClose={close} />;
    case "edit-group":
      return <EditGroupModal {...modal} onClose={close} />;
    case "safety-number":
      return <SafetyNumberModal {...modal} onClose={close} />;
    case "coming-soon":
      return (
        <Modal title={modal.feature} onClose={close} footer={<button className="btn-primary" onClick={close}>OK</button>}>
          <div className="flex items-center gap-3 text-body text-ink-2">
            <Rocket size={22} className="shrink-0 text-accent" />
            {modal.feature} {modal.feature.endsWith("s") ? "are" : "is"} coming soon.
          </div>
        </Modal>
      );
    case "image":
      return <ImageViewer url={modal.url} filename={modal.filename} onClose={close} />;
    case "message-info":
      return <MessageInfoModal messageId={modal.messageId} onClose={close} />;
    case "shortcuts":
      return (
        <Modal title="Keyboard shortcuts" onClose={close}>
          <dl className="divide-y divide-line">
            {SHORTCUTS.map(([keys, label]) => (
              <div key={keys} className="flex items-center justify-between py-2.5">
                <dt className="text-body text-ink">{label}</dt>
                <dd>
                  <kbd className="rounded-md bg-field px-2 py-1 font-sans text-body-sm text-ink-2">{keys}</kbd>
                </dd>
              </div>
            ))}
          </dl>
        </Modal>
      );
    case "confirm":
      return (
        <Modal
          title={modal.title}
          onClose={close}
          width={380}
          footer={
            <>
              <button className="btn-secondary" onClick={close}>
                Cancel
              </button>
              <button
                className={modal.danger ? "btn-danger" : "btn-primary"}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await modal.onConfirm();
                  setBusy(false);
                  close();
                }}
              >
                {modal.confirmLabel}
              </button>
            </>
          }
        >
          <p className="text-body text-ink-2">{modal.body}</p>
        </Modal>
      );
  }
}
