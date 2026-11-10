import { create } from "zustand";
import { api, ApiError } from "@/lib/api";
import { getPref } from "@/lib/prefs";
import { realtime, type ConnectionState } from "@/lib/socket";
import type { Attachment, Contact, Conversation, Message, MessageStatus, ServerEvent, User } from "@/lib/types";
import { uid } from "@/lib/utils";
import { toast } from "./ui";

/** A message as the UI holds it: server fields plus client-only send state. */
export type UIMessage = Message & { localStatus?: "sending" | "failed" };

export interface Thread {
  items: UIMessage[]; // oldest first; pending sends (negative ids) at the end
  hasMore: boolean;
  loading: boolean;
  loaded: boolean;
}

/** A file picked in the composer, with image dimensions when known. */
export interface OutgoingFile {
  file: File;
  size: { width: number; height: number } | null;
}

export const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

/** Files waiting to be uploaded/sent, keyed by the message's client_id. The
 *  uploaded id is remembered so a retry doesn't upload the file twice. */
const outbox = new Map<string, OutgoingFile & { uploadedId?: number }>();

interface ChatState {
  me: User | null;
  users: Record<number, User>;
  nicknames: Record<number, string | null>;
  contactIds: number[];
  conversations: Record<number, Conversation>;
  threads: Record<number, Thread>;
  /** conversationId → userId → typing expires at (ms) */
  typing: Record<number, Record<number, number>>;
  activeId: number | null;
  connection: ConnectionState;
  ready: boolean;

  reset(): void;
  setMe(user: User): void;
  setConnection(state: ConnectionState): void;
  bootstrap(): Promise<void>;
  refreshConversations(): Promise<void>;
  setContacts(contacts: Contact[]): void;
  addContact(contact: Contact): void;
  upsertConversation(conv: Conversation): void;

  open(id: number | null): void;
  loadThread(id: number): Promise<void>;
  loadOlder(id: number): Promise<void>;
  send(convId: number, body: string, replyTo?: Message | null, file?: OutgoingFile | null): Promise<void>;
  retry(convId: number, clientId: string): Promise<void>;
  markRead(convId: number): void;
  toggleReaction(message: Message, emoji: string): Promise<void>;
  editMessage(message: Message, body: string): Promise<boolean>;
  deleteForEveryone(message: Message): Promise<void>;
  applyEvent(event: ServerEvent): void;
  pruneTyping(): void;
}

// ---------- pure helpers ----------

const STATUS_RANK: Record<MessageStatus, number> = { sent: 1, delivered: 2, read: 3 };

/** Status only moves forward; events can arrive out of order (e.g. the REST
 *  response saying "sent" after the socket already said "delivered"). */
function bestStatus(a: MessageStatus | null, b: MessageStatus | null): MessageStatus | null {
  if (!a) return b;
  if (!b) return a;
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}

function sameMessage(a: Message, b: Message) {
  return a.id === b.id || (a.client_id != null && a.client_id === b.client_id && a.sender_id === b.sender_id);
}

function merge(old: UIMessage, incoming: Message): UIMessage {
  // Keep showing the local preview of a photo we just sent instead of re-downloading it.
  const attachment =
    incoming.attachment && old.attachment?.url.startsWith("blob:")
      ? { ...incoming.attachment, url: old.attachment.url }
      : incoming.attachment;
  return { ...old, ...incoming, attachment, status: bestStatus(old.status, incoming.status), localStatus: undefined };
}

/** Insert or update a message, keeping server messages in id order. */
function upsert(items: UIMessage[], msg: Message): UIMessage[] {
  const i = items.findIndex((m) => sameMessage(m, msg));
  const next = items.slice();
  if (i >= 0) {
    next[i] = merge(items[i], msg);
    return next;
  }
  let j = next.length;
  if (msg.id > 0) while (j > 0 && (next[j - 1].id < 0 || next[j - 1].id > msg.id)) j--;
  next.splice(j, 0, msg);
  return next;
}

function patchMessage(items: UIMessage[], id: number, patch: (m: UIMessage) => UIMessage): UIMessage[] {
  return items.map((m) => (m.id === id ? patch(m) : m));
}

function withUsers(users: Record<number, User>, list: User[]): Record<number, User> {
  if (list.length === 0) return users;
  const next = { ...users };
  for (const u of list) next[u.id] = u;
  return next;
}

class SendError extends Error {
  constructor(message: string, public cause: unknown) {
    super(message);
  }
}

/** A readable reason for a failed send, e.g. "Couldn't upload the attachment: Files can be up to 5 MB". */
function describeSendError(e: unknown): string {
  const prefix = e instanceof SendError ? e.message : "Message not sent";
  const root = e instanceof SendError ? e.cause : e;
  if (root instanceof ApiError) {
    if (root.status === 404 || root.status === 405) return `${prefix}: the server doesn't support this yet (is the backend up to date?)`;
    return `${prefix}: ${root.message}`;
  }
  return `${prefix}: can't reach the server`;
}

const emptyThread: Thread = { items: [], hasMore: false, loading: false, loaded: false };

const initial = {
  me: null,
  users: {},
  nicknames: {},
  contactIds: [],
  conversations: {},
  threads: {},
  typing: {},
  activeId: null,
  connection: "connecting" as ConnectionState,
  ready: false,
};

export const useChat = create<ChatState>((set, get) => {
  /** Shared by sends, socket pushes and resyncs: put a message in its thread
   *  and make it the conversation's preview if it is the newest. */
  function ingest(msg: Message, opts: { countUnread?: boolean } = {}) {
    set((s) => {
      const conv = s.conversations[msg.conversation_id];
      if (!conv) return {};
      const thread = s.threads[msg.conversation_id];
      const last = conv.last_message;
      const isNewest = !last || sameMessage(last, msg) || msg.id < 0 || last.id < 0 || msg.id >= last.id;
      const typing = { ...s.typing };
      if (msg.sender_id != null && typing[conv.id]?.[msg.sender_id]) {
        typing[conv.id] = { ...typing[conv.id] };
        delete typing[conv.id][msg.sender_id];
      }
      return {
        threads: thread ? { ...s.threads, [conv.id]: { ...thread, items: upsert(thread.items, msg) } } : s.threads,
        conversations: {
          ...s.conversations,
          [conv.id]: {
            ...conv,
            last_message: isNewest ? (last && sameMessage(last, msg) ? merge(last, msg) : msg) : last,
            last_activity_at: msg.created_at > conv.last_activity_at ? msg.created_at : conv.last_activity_at,
            unread_count: conv.unread_count + (opts.countUnread ? 1 : 0),
            // A new message brings an archived chat back, unless it's muted.
            is_archived: opts.countUnread && !conv.is_muted ? false : conv.is_archived,
          },
        },
        typing,
      };
    });
  }

  function updateMessageEverywhere(convId: number, id: number, patch: (m: UIMessage) => UIMessage) {
    set((s) => {
      const conv = s.conversations[convId];
      const thread = s.threads[convId];
      return {
        threads: thread ? { ...s.threads, [convId]: { ...thread, items: patchMessage(thread.items, id, patch) } } : s.threads,
        conversations:
          conv && conv.last_message?.id === id
            ? { ...s.conversations, [convId]: { ...conv, last_message: patch(conv.last_message) } }
            : s.conversations,
      };
    });
  }

  /** An edited or deleted message: replace it, and refresh any quotes of it. */
  function applyMessageUpdate(msg: Message) {
    const quote = (m: UIMessage): UIMessage =>
      m.reply_to?.id === msg.id
        ? { ...m, reply_to: { ...m.reply_to, body: msg.body, attachment: msg.attachment, deleted: !!msg.deleted_at } }
        : m;
    set((s) => {
      const conv = s.conversations[msg.conversation_id];
      const thread = s.threads[msg.conversation_id];
      const items = thread?.items.map((m) => (m.id === msg.id ? merge(m, msg) : quote(m)));
      const last = conv?.last_message;
      return {
        threads: thread && items ? { ...s.threads, [msg.conversation_id]: { ...thread, items } } : s.threads,
        conversations:
          conv && last
            ? { ...s.conversations, [conv.id]: { ...conv, last_message: last.id === msg.id ? merge(last, msg) : quote(last) } }
            : s.conversations,
      };
    });
  }

  function setThread(id: number, patch: Partial<Thread>) {
    set((s) => ({ threads: { ...s.threads, [id]: { ...(s.threads[id] ?? emptyThread), ...patch } } }));
  }

  async function deliver(convId: number, body: string, clientId: string, replyToId?: number) {
    try {
      const pending = outbox.get(clientId);
      if (pending && pending.uploadedId == null) {
        try {
          pending.uploadedId = (await api.uploadAttachment(pending.file, pending.size)).id;
        } catch (e) {
          throw new SendError("Couldn't upload the attachment", e);
        }
      }
      const saved = await api.sendMessage(convId, body, clientId, replyToId, pending?.uploadedId);
      outbox.delete(clientId);
      ingest(saved);
    } catch (e) {
      // Say why, so a failed send is never a silent mystery.
      console.error("send failed", e);
      toast(describeSendError(e), { tone: "error", ms: 6000 });
      set((s) => {
        const thread = s.threads[convId];
        if (!thread) return {};
        return {
          threads: {
            ...s.threads,
            [convId]: {
              ...thread,
              items: thread.items.map((m) => (m.client_id === clientId && m.id < 0 ? { ...m, localStatus: "failed" as const } : m)),
            },
          },
        };
      });
    }
  }

  return {
    ...initial,

    reset: () => set(initial),
    setMe: (me) => set((s) => ({ me, users: withUsers(s.users, [me]) })),
    setConnection: (connection) => set({ connection }),

    bootstrap: async () => {
      const [convs, contacts] = await Promise.all([api.conversations(), api.contacts()]);
      get().setContacts(contacts);
      for (const c of convs) get().upsertConversation(c);
      set({ ready: true });
    },

    refreshConversations: async () => {
      const convs = await api.conversations();
      for (const c of convs) get().upsertConversation(c);
    },

    setContacts: (contacts) =>
      set((s) => ({
        contactIds: contacts.map((c) => c.user.id),
        nicknames: Object.fromEntries(contacts.map((c) => [c.user.id, c.nickname])),
        users: withUsers(s.users, contacts.map((c) => c.user)),
      })),

    addContact: (contact) =>
      set((s) => ({
        contactIds: s.contactIds.includes(contact.user.id) ? s.contactIds : [...s.contactIds, contact.user.id],
        nicknames: { ...s.nicknames, [contact.user.id]: contact.nickname },
        users: withUsers(s.users, [contact.user]),
      })),

    upsertConversation: (conv) =>
      set((s) => ({
        conversations: { ...s.conversations, [conv.id]: conv },
        users: withUsers(s.users, conv.members.map((m) => m.user)),
      })),

    open: (id) => {
      set({ activeId: id });
      if (id != null && !get().threads[id]?.loaded) void get().loadThread(id);
    },

    loadThread: async (id) => {
      setThread(id, { loading: true });
      try {
        const page = await api.messages(id);
        // Messages may have arrived over the socket while we were loading.
        const pending = get().threads[id]?.items ?? [];
        const items = pending.reduce(upsert, page.messages as UIMessage[]);
        setThread(id, { items, hasMore: page.has_more, loaded: true, loading: false });
      } catch {
        setThread(id, { loading: false });
      }
    },

    loadOlder: async (id) => {
      const thread = get().threads[id];
      if (!thread || thread.loading || !thread.hasMore) return;
      const oldest = thread.items.find((m) => m.id > 0);
      setThread(id, { loading: true });
      try {
        const page = await api.messages(id, oldest?.id);
        const current = get().threads[id]?.items ?? [];
        setThread(id, { items: current.reduce(upsert, page.messages as UIMessage[]), hasMore: page.has_more, loading: false });
      } catch {
        setThread(id, { loading: false });
      }
    },

    send: async (convId, body, replyTo, file) => {
      const me = get().me;
      if (!me) return;
      const clientId = uid();
      let attachment: Attachment | null = null;
      if (file) {
        outbox.set(clientId, { ...file });
        attachment = {
          id: -1,
          url: URL.createObjectURL(file.file),
          filename: file.file.name,
          content_type: file.file.type,
          size: file.file.size,
          width: file.size?.width ?? null,
          height: file.size?.height ?? null,
          is_image: IMAGE_TYPES.has(file.file.type),
        };
      }
      // Optimistic message: shown immediately with the "sending" indicator.
      ingest({
        id: -Date.now(),
        conversation_id: convId,
        sender_id: me.id,
        kind: "text",
        body,
        meta: null,
        client_id: clientId,
        reply_to: replyTo
          ? { id: replyTo.id, sender_id: replyTo.sender_id, body: replyTo.body, attachment: replyTo.attachment }
          : null,
        attachment,
        reactions: [],
        created_at: new Date().toISOString(),
        expires_at: null,
        status: null,
        localStatus: "sending",
      } as UIMessage);
      await deliver(convId, body, clientId, replyTo?.id);
    },

    retry: async (convId, clientId) => {
      const msg = get().threads[convId]?.items.find((m) => m.client_id === clientId && m.id < 0);
      if (!msg) return;
      updateMessageEverywhere(convId, msg.id, (m) => ({ ...m, localStatus: "sending" }));
      // Same client_id → the server returns the original if the first try actually landed.
      await deliver(convId, msg.body, clientId, msg.reply_to?.id);
    },

    markRead: (convId) => {
      const conv = get().conversations[convId];
      if (!conv || conv.unread_count === 0) return;
      set((s) => ({ conversations: { ...s.conversations, [convId]: { ...conv, unread_count: 0 } } }));
      if (!realtime.send({ type: "read", conversation_id: convId })) api.markRead(convId).catch(() => {});
    },

    toggleReaction: async (message, emoji) => {
      const me = get().me;
      if (!me) return;
      const mine = message.reactions.find((r) => r.user_id === me.id);
      const removing = mine?.emoji === emoji;
      updateMessageEverywhere(message.conversation_id, message.id, (m) => ({
        ...m,
        reactions: [
          ...m.reactions.filter((r) => r.user_id !== me.id),
          ...(removing ? [] : [{ user_id: me.id, emoji }]),
        ],
      }));
      await (removing ? api.unreact(message.id) : api.react(message.id, emoji));
    },

    editMessage: async (message, body) => {
      try {
        applyMessageUpdate(await api.editMessage(message.id, body));
        return true;
      } catch (e) {
        toast(e instanceof ApiError ? e.message : "Couldn't edit the message", { tone: "error" });
        return false;
      }
    },

    deleteForEveryone: async (message) => {
      try {
        applyMessageUpdate(await api.deleteForEveryone(message.id));
      } catch (e) {
        toast(e instanceof ApiError ? e.message : "Couldn't delete the message", { tone: "error" });
      }
    },

    applyEvent: (event) => {
      const s = get();
      switch (event.type) {
        case "message.new": {
          const msg = event.message;
          if (!s.conversations[msg.conversation_id]) {
            // First message in a chat we don't know yet (e.g. someone new messaged us).
            api.conversation(msg.conversation_id).then(get().upsertConversation).catch(() => {});
            return;
          }
          ingest(msg, { countUnread: msg.sender_id !== s.me?.id && msg.kind === "text" });
          return;
        }
        case "message.status":
          for (const u of event.updates) {
            updateMessageEverywhere(u.conversation_id, u.id, (m) => ({ ...m, status: bestStatus(m.status, u.status) }));
          }
          return;
        case "message.reactions":
          updateMessageEverywhere(event.conversation_id, event.message_id, (m) => ({ ...m, reactions: event.reactions }));
          return;
        case "message.updated":
          applyMessageUpdate(event.message);
          return;
        case "message.deleted": {
          const ids = new Set(event.ids);
          const thread = s.threads[event.conversation_id];
          if (thread) setThread(event.conversation_id, { items: thread.items.filter((m) => !ids.has(m.id)) });
          const conv = s.conversations[event.conversation_id];
          if (conv?.last_message && ids.has(conv.last_message.id)) {
            api.conversation(conv.id).then(get().upsertConversation).catch(() => {});
          }
          return;
        }
        case "conversation.updated":
          get().upsertConversation(event.conversation);
          return;
        case "conversation.read": {
          const conv = s.conversations[event.conversation_id];
          if (conv) set({ conversations: { ...s.conversations, [conv.id]: { ...conv, unread_count: 0 } } });
          return;
        }
        case "typing": {
          // Typing indicators off (Settings → Privacy): you neither send nor see them, as in Signal.
          if (!getPref("typing-indicators", true)) return;
          const forConv = { ...(s.typing[event.conversation_id] ?? {}) };
          if (event.is_typing) forConv[event.user_id] = Date.now() + 6000;
          else delete forConv[event.user_id];
          set({ typing: { ...s.typing, [event.conversation_id]: forConv } });
          return;
        }
        case "presence": {
          const user = s.users[event.user_id];
          if (user) {
            set({ users: { ...s.users, [user.id]: { ...user, online: event.online, last_seen_at: event.last_seen_at } } });
          }
          return;
        }
        case "user.updated":
          set({
            users: { ...s.users, [event.user.id]: event.user },
            ...(event.user.id === s.me?.id ? { me: event.user } : {}),
          });
          return;
        default:
          return;
      }
    },

    pruneTyping: () => {
      const now = Date.now();
      const { typing } = get();
      let changed = false;
      const next: ChatState["typing"] = {};
      for (const [convId, users] of Object.entries(typing)) {
        const kept = Object.fromEntries(Object.entries(users).filter(([, exp]) => exp > now));
        if (Object.keys(kept).length !== Object.keys(users).length) changed = true;
        next[Number(convId)] = kept;
      }
      if (changed) set({ typing: next });
    },
  };
});
