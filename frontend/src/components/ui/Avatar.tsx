import { NotebookPen, Users } from "lucide-react";
import { avatarColor } from "@/lib/colors";
import { directPeer, isNoteToSelf, initials, type NameContext, conversationTitle } from "@/lib/names";
import type { Conversation } from "@/lib/types";
import { cx } from "@/lib/utils";

interface AvatarProps {
  name: string;
  color: string;
  url?: string | null;
  size?: number;
  variant?: "person" | "group" | "note";
  online?: boolean;
  className?: string;
}

/** Signal-style avatar: photo, or initials / icon on a pastel palette color. */
export function Avatar({ name, color, url, size = 48, variant = "person", online, className }: AvatarProps) {
  const { bg, fg } = avatarColor(color);
  const glyph = Math.round(size * 0.5);
  return (
    <div className={cx("relative shrink-0", className)} style={{ width: size, height: size }}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- data URLs, nothing for next/image to optimise
        <img src={url} alt="" className="h-full w-full rounded-full object-cover" />
      ) : (
        <div
          className="flex h-full w-full select-none items-center justify-center rounded-full font-medium"
          style={{ background: bg, color: fg, fontSize: Math.max(10, Math.round(size * 0.38)) }}
          aria-hidden
        >
          {variant === "group" ? (
            <Users size={glyph} strokeWidth={1.75} />
          ) : variant === "note" ? (
            <NotebookPen size={glyph} strokeWidth={1.75} />
          ) : (
            initials(name) || <Users size={glyph} strokeWidth={1.75} />
          )}
        </div>
      )}
      {online && (
        <span
          className="absolute bottom-0 right-0 rounded-full border-2 border-pane bg-online"
          style={{ width: Math.max(10, size * 0.26), height: Math.max(10, size * 0.26) }}
          title="Online"
        />
      )}
    </div>
  );
}

/** Avatar for a conversation: group photo/icon, the other person, or Note to Self. */
export function ConversationAvatar({
  conv,
  ctx,
  size = 48,
  showPresence = false,
}: {
  conv: Conversation;
  ctx: NameContext;
  size?: number;
  showPresence?: boolean;
}) {
  if (conv.kind === "group") {
    return <Avatar name={conv.title ?? ""} color={conv.avatar_color} url={conv.avatar_url} size={size} variant="group" />;
  }
  if (isNoteToSelf(conv, ctx.meId)) {
    const me = ctx.users[ctx.meId];
    return <Avatar name="Note to Self" color={me?.avatar_color ?? "A110"} size={size} variant="note" />;
  }
  const peer = directPeer(conv, ctx.meId);
  const user = peer ? ctx.users[peer.id] ?? peer : undefined;
  return (
    <Avatar
      name={conversationTitle(ctx, conv)}
      color={user?.avatar_color ?? "A110"}
      url={user?.avatar_url}
      size={size}
      online={showPresence && user?.online}
    />
  );
}
