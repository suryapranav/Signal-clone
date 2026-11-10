// Mirrors backend/app/schemas.py. Timestamps are ISO-8601 UTC strings.

export type AvatarColor =
  | "A100" | "A110" | "A120" | "A130" | "A140" | "A150"
  | "A160" | "A170" | "A180" | "A190" | "A200" | "A210";

export interface User {
  id: number;
  phone: string;
  username: string | null;
  display_name: string;
  about: string;
  avatar_color: AvatarColor;
  avatar_url: string | null;
  online: boolean;
  last_seen_at: string | null;
}

export interface Contact {
  user: User;
  nickname: string | null;
  created_at: string;
}

/** Server-side statuses; "sending" and "failed" exist only on the client. */
export type MessageStatus = "sent" | "delivered" | "read";
export type ClientMessageStatus = "sending" | "failed" | MessageStatus;

export type SystemEvent =
  | "group_created"
  | "members_added"
  | "member_removed"
  | "member_left"
  | "title_changed"
  | "timer_changed"
  | "admin_granted"
  | "admin_revoked";

export interface Attachment {
  id: number;
  url: string; // API path, or a blob: URL while an optimistic upload is in flight
  filename: string;
  content_type: string;
  size: number;
  width: number | null;
  height: number | null;
  is_image: boolean;
}

export interface Message {
  id: number;
  conversation_id: number;
  sender_id: number | null;
  kind: "text" | "system";
  body: string; // text, or a SystemEvent key when kind === "system"
  meta: Record<string, unknown> | null;
  client_id: string | null;
  reply_to: { id: number; sender_id: number | null; body: string; attachment: Attachment | null } | null;
  attachment: Attachment | null;
  reactions: { user_id: number; emoji: string }[];
  created_at: string;
  expires_at: string | null;
  status: MessageStatus | null; // only on the viewer's own messages
}

export interface Member {
  user: User;
  role: "admin" | "member";
  joined_at: string;
}

export interface Conversation {
  id: number;
  kind: "direct" | "group";
  title: string | null;
  description: string;
  avatar_color: AvatarColor;
  avatar_url: string | null;
  disappearing_seconds: number | null;
  created_by: number | null;
  created_at: string;
  last_activity_at: string;
  members: Member[];
  is_member: boolean;
  my_role: "admin" | "member";
  is_pinned: boolean;
  is_archived: boolean;
  is_muted: boolean;
  unread_count: number;
  last_message: Message | null;
}

export interface MessagePage {
  messages: Message[];
  has_more: boolean;
}

export interface AuthResponse {
  token: string;
  user: User;
  needs_profile: boolean;
}

/** Events pushed by the server over the WebSocket (see backend/app/routers/ws.py). */
export type ServerEvent =
  | { type: "ready"; user_id: number }
  | { type: "message.new"; message: Message }
  | { type: "message.status"; updates: { id: number; conversation_id: number; status: MessageStatus }[] }
  | { type: "message.reactions"; conversation_id: number; message_id: number; reactions: Message["reactions"] }
  | { type: "message.deleted"; conversation_id: number; ids: number[] }
  | { type: "conversation.updated"; conversation: Conversation }
  | { type: "conversation.read"; conversation_id: number }
  | { type: "typing"; conversation_id: number; user_id: number; is_typing: boolean }
  | { type: "presence"; user_id: number; online: boolean; last_seen_at: string | null }
  | { type: "user.updated"; user: User }
  | { type: "pong" };

export type ClientEvent =
  | { type: "typing"; conversation_id: number; is_typing: boolean }
  | { type: "read"; conversation_id: number }
  | { type: "ping" };
