import { attachmentLabel } from "./files";
import { timerLabel } from "./format";
import type { Conversation, Message, User } from "./types";

/** What name-rendering needs to know about the viewer's world. */
export interface NameContext {
  meId: number;
  users: Record<number, User>;
  nicknames: Record<number, string | null>;
}

export function userName(ctx: NameContext, userId: number | null, fallback = "Unknown"): string {
  if (userId == null) return fallback;
  return ctx.nicknames[userId] || ctx.users[userId]?.display_name || fallback;
}

export function firstName(ctx: NameContext, userId: number | null): string {
  return userName(ctx, userId).split(" ")[0];
}

export function isNoteToSelf(conv: Conversation, meId: number) {
  return conv.kind === "direct" && conv.members.length === 1 && conv.members[0].user.id === meId;
}

/** The other person in a 1:1 chat (or yourself in Note to Self). */
export function directPeer(conv: Conversation, meId: number): User | undefined {
  return (conv.members.find((m) => m.user.id !== meId) ?? conv.members[0])?.user;
}

export function conversationTitle(ctx: NameContext, conv: Conversation): string {
  if (conv.kind === "group") return conv.title ?? "Group";
  if (isNoteToSelf(conv, ctx.meId)) return "Note to Self";
  const peer = directPeer(conv, ctx.meId);
  return peer ? userName(ctx, peer.id) : "Unknown";
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

type Target = { id: number; name: string };

/** Render a system event from the viewer's point of view, e.g.
 *  "You added Bob." / "Alice added you." / "Alice added Bob and Priya." */
export function systemText(ctx: NameContext, msg: Message): string {
  const meta = (msg.meta ?? {}) as { users?: Target[]; user?: Target; title?: string; seconds?: number | null };
  const actorIsMe = msg.sender_id === ctx.meId;
  const actor = actorIsMe ? "You" : userName(ctx, msg.sender_id);
  const target = (t: Target) => (t.id === ctx.meId ? "you" : ctx.nicknames[t.id] || ctx.users[t.id]?.display_name || t.name);

  switch (msg.body) {
    case "group_created":
      return `${actor} created the group.`;
    case "members_added":
      return `${actor} added ${joinNames((meta.users ?? []).map(target))}.`;
    case "member_removed":
      return `${actor} removed ${meta.user ? target(meta.user) : "a member"}.`;
    case "member_left":
      return `${actor} left the group.`;
    case "title_changed":
      return `${actor} changed the group name to "${meta.title}".`;
    case "timer_changed":
      return meta.seconds
        ? `${actor} set the disappearing message timer to ${timerLabel(meta.seconds)}.`
        : `${actor} disabled disappearing messages.`;
    case "admin_granted":
      return meta.user?.id === ctx.meId ? `${actor} made you an admin.` : `${actor} made ${meta.user ? target(meta.user) : "someone"} an admin.`;
    case "admin_revoked":
      return meta.user?.id === ctx.meId
        ? `${actor} revoked your admin privileges.`
        : `${actor} revoked admin privileges from ${meta.user ? target(meta.user) : "someone"}.`;
    default:
      return msg.body;
  }
}

/** One-line preview for the chat list. */
export function previewText(ctx: NameContext, conv: Conversation, msg: Message | null): string {
  if (!msg) return isNoteToSelf(conv, ctx.meId) ? "Add notes to yourself" : "";
  if (msg.kind === "system") return systemText(ctx, msg);
  if (msg.deleted_at) return msg.sender_id === ctx.meId ? "You deleted this message" : "This message was deleted";
  const text = messageSummary(msg);
  if (conv.kind === "group" && msg.sender_id !== ctx.meId) return `${firstName(ctx, msg.sender_id)}: ${text}`;
  return text;
}

/** Text of a message, with its attachment shown as "📷 Photo" / "📎 file.pdf". */
export function messageSummary(
  msg: Pick<Message, "body" | "attachment"> & { deleted_at?: string | null; deleted?: boolean },
): string {
  if (msg.deleted_at || msg.deleted) return "This message was deleted";
  if (!msg.attachment) return msg.body;
  const label = attachmentLabel(msg.attachment);
  return msg.body ? `${label.split(" ")[0]} ${msg.body}` : label;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((p) => /[\p{L}\p{N}]/u.test(p[0] ?? ""));
  if (parts.length === 0) return "";
  const first = [...parts[0]][0] ?? "";
  const last = parts.length > 1 ? [...parts[parts.length - 1]][0] ?? "" : "";
  return (first + last).toUpperCase();
}
