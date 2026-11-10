import type {
  AuthResponse,
  Contact,
  Conversation,
  Message,
  MessagePage,
  User,
} from "./types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
export const WS_URL = API_URL.replace(/^http/, "ws") + "/ws";

const TOKEN_KEY = "signal.token";

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string | null) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable (private mode); session lasts for this tab only */
    }
  },
};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** FastAPI returns {detail: string} or {detail: [{msg}]} for validation errors. */
function errorMessage(body: unknown, fallback: string): string {
  const detail = (body as { detail?: unknown })?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg).replace(/^Value error, /, "");
  return fallback;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(`${API_URL}/api${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, errorMessage(data, `Request failed (${res.status})`));
  return data as T;
}

export const api = {
  // auth
  requestOtp: (phone: string) =>
    request<{ phone: string; registered: boolean; otp_hint: string }>("POST", "/auth/request-otp", { phone }),
  verifyOtp: (phone: string, code: string) =>
    request<AuthResponse>("POST", "/auth/verify-otp", { phone, code }),
  logout: () => request<void>("POST", "/auth/logout"),

  // profile & users
  me: () => request<User>("GET", "/users/me"),
  updateMe: (patch: Partial<Pick<User, "display_name" | "about" | "avatar_color" | "avatar_url" | "username">>) =>
    request<User>("PATCH", "/users/me", patch),
  lookupUser: (q: string) => request<User>("GET", `/users/lookup?q=${encodeURIComponent(q)}`),

  // contacts
  contacts: () => request<Contact[]>("GET", "/contacts"),
  addContact: (query: string, nickname?: string) => request<Contact>("POST", "/contacts", { query, nickname }),
  removeContact: (userId: number) => request<void>("DELETE", `/contacts/${userId}`),

  // conversations
  conversations: () => request<Conversation[]>("GET", "/conversations"),
  conversation: (id: number) => request<Conversation>("GET", `/conversations/${id}`),
  openDirect: (userId: number) => request<Conversation>("POST", "/conversations/direct", { user_id: userId }),
  createGroup: (title: string, memberIds: number[], avatarColor?: string) =>
    request<Conversation>("POST", "/conversations/group", { title, member_ids: memberIds, avatar_color: avatarColor }),
  updateConversation: (
    id: number,
    patch: Partial<{ title: string; description: string; avatar_color: string; disappearing_seconds: number }>,
  ) => request<Conversation>("PATCH", `/conversations/${id}`, patch),
  updatePrefs: (id: number, prefs: Partial<Pick<Conversation, "is_pinned" | "is_archived" | "is_muted">>) =>
    request<Conversation>("PATCH", `/conversations/${id}/prefs`, prefs),
  markRead: (id: number) => request<void>("POST", `/conversations/${id}/read`),
  addMembers: (id: number, userIds: number[]) =>
    request<Conversation>("POST", `/conversations/${id}/members`, { user_ids: userIds }),
  removeMember: (id: number, userId: number) => request<void>("DELETE", `/conversations/${id}/members/${userId}`),
  setMemberRole: (id: number, userId: number, role: "admin" | "member") =>
    request<Conversation>("PATCH", `/conversations/${id}/members/${userId}`, { role }),

  // messages
  messages: (convId: number, beforeId?: number) =>
    request<MessagePage>("GET", `/conversations/${convId}/messages${beforeId ? `?before_id=${beforeId}` : ""}`),
  sendMessage: (convId: number, body: string, clientId: string, replyToId?: number) =>
    request<Message>("POST", `/conversations/${convId}/messages`, {
      body,
      client_id: clientId,
      reply_to_id: replyToId,
    }),
  react: (messageId: number, emoji: string) => request<void>("PUT", `/messages/${messageId}/reaction`, { emoji }),
  unreact: (messageId: number) => request<void>("DELETE", `/messages/${messageId}/reaction`),
};
