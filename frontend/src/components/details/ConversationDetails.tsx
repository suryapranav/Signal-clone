"use client";

import {
  ArrowLeft, Bell, BellOff, EllipsisVertical, LogOut, MessageCircle, Pencil, Phone, ShieldCheck, Timer, UserMinus, UserPlus, Video,
} from "lucide-react";
import type { ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import { comingSoon, startDirectChat, updatePrefs } from "@/lib/actions";
import { formatPhone, lastSeen, TIMER_OPTIONS, timerLabel } from "@/lib/format";
import { conversationTitle, directPeer, isNoteToSelf, userName } from "@/lib/names";
import type { Conversation, Member } from "@/lib/types";
import { useNames } from "@/hooks/useNames";
import { useChat } from "@/store/chat";
import { toast, useUI } from "@/store/ui";
import { Avatar, ConversationAvatar } from "../ui/Avatar";
import { Menu } from "../ui/Menu";

async function run<T>(action: () => Promise<T>, success?: string) {
  try {
    const result = await action();
    if (success) toast(success);
    return result;
  } catch (e) {
    toast(e instanceof ApiError ? e.message : "Something went wrong", { tone: "error" });
  }
}

export function confirmLeaveGroup(conv: Conversation) {
  const me = useChat.getState().me!;
  useUI.getState().openModal({
    kind: "confirm",
    title: "Leave group?",
    body: "You will no longer be able to send or receive messages in this group.",
    confirmLabel: "Leave",
    danger: true,
    onConfirm: () =>
      run(async () => {
        await api.removeMember(conv.id, me.id);
        useChat.getState().upsertConversation(await api.conversation(conv.id));
      }, "You left the group"),
  });
}

function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-2">
      {title && <h3 className="section-label px-0">{title}</h3>}
      {children}
    </section>
  );
}

function QuickAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button className="flex w-20 flex-col items-center gap-1.5 rounded-xl bg-field py-3 text-body-sm text-ink hover:bg-selected" onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function MemberRow({ member, conv }: { member: Member; conv: Conversation }) {
  const ctx = useNames();
  const openModal = useUI((s) => s.openModal);
  const user = ctx.users[member.user.id] ?? member.user;
  const isMe = user.id === ctx.meId;
  const iAmAdmin = conv.my_role === "admin" && conv.is_member;
  const name = isMe ? "You" : userName(ctx, user.id);

  const setRole = (role: "admin" | "member") =>
    run(async () => useChat.getState().upsertConversation(await api.setMemberRole(conv.id, user.id, role)), role === "admin" ? `${name} is now an admin` : `${name} is no longer an admin`);

  const remove = () =>
    openModal({
      kind: "confirm",
      title: `Remove ${name}?`,
      body: `${name} will be removed from "${conv.title}" and won't receive new messages.`,
      confirmLabel: "Remove",
      danger: true,
      onConfirm: () => run(() => api.removeMember(conv.id, user.id), `${name} removed`),
    });

  return (
    <div className="flex items-center gap-3 rounded-lg py-2">
      <Avatar name={user.display_name} color={user.avatar_color} url={user.avatar_url} size={36} online={!isMe && user.online} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{name}</div>
        <div className="truncate text-body-sm text-ink-2">{user.about || (isMe ? "" : user.online ? "Online" : lastSeen(user.last_seen_at))}</div>
      </div>
      {member.role === "admin" && <span className="text-body-sm text-ink-2">Admin</span>}
      {!isMe && (
        <Menu
          trigger={({ toggle }) => (
            <button className="icon-btn" onClick={toggle} aria-label={`Options for ${name}`}>
              <EllipsisVertical size={16} />
            </button>
          )}
          items={[
            { label: "Message", icon: <MessageCircle />, onSelect: () => startDirectChat(user.id) },
            { label: "Make admin", icon: <ShieldCheck />, onSelect: () => setRole("admin"), hidden: !iAmAdmin || member.role === "admin" },
            { label: "Remove as admin", icon: <ShieldCheck />, onSelect: () => setRole("member"), hidden: !iAmAdmin || member.role !== "admin" },
            { label: "Remove from group", icon: <UserMinus />, danger: true, onSelect: remove, hidden: !iAmAdmin },
          ]}
        />
      )}
    </div>
  );
}

/** Signal's "Chat settings" / "Group settings" page, replacing the message view. */
export function ConversationDetails({ convId }: { convId: number }) {
  const ctx = useNames();
  const conv = useChat((s) => s.conversations[convId]);
  const contactIds = useChat((s) => s.contactIds);
  const setDetailsOpen = useUI((s) => s.setDetailsOpen);
  const openModal = useUI((s) => s.openModal);
  if (!conv) return null;

  const isGroup = conv.kind === "group";
  const note = isNoteToSelf(conv, ctx.meId);
  const peer = !isGroup && !note ? directPeer(conv, ctx.meId) : undefined;
  const peerUser = peer && (ctx.users[peer.id] ?? peer);
  const canEdit = conv.is_member && (!isGroup || conv.my_role === "admin");
  const isContact = !!peer && contactIds.includes(peer.id);

  const setTimer = (seconds: number) =>
    run(async () => useChat.getState().upsertConversation(await api.updateConversation(conv.id, { disappearing_seconds: seconds })),
      seconds ? `Disappearing messages set to ${timerLabel(seconds)}` : "Disappearing messages turned off");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-2 md:px-3">
        <button className="icon-btn" onClick={() => setDetailsOpen(false)} aria-label="Back to chat">
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-semibold">{isGroup ? "Group settings" : "Chat settings"}</h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl px-5 pb-10">
          <div className="flex flex-col items-center py-8 text-center">
            <ConversationAvatar conv={conv} ctx={ctx} size={80} />
            <h2 className="mt-3 flex items-center gap-2 text-title font-semibold">
              {conversationTitle(ctx, conv)}
              {isGroup && canEdit && (
                <button className="icon-btn h-7 w-7" onClick={() => openModal({ kind: "edit-group", convId: conv.id })} aria-label="Edit group">
                  <Pencil size={14} />
                </button>
              )}
            </h2>
            {peerUser && (
              <>
                {peerUser.about && <p className="mt-1 text-body text-ink-2">{peerUser.about}</p>}
                <p className="mt-1 text-body-sm text-ink-3">
                  {formatPhone(peerUser.phone)}
                  {peerUser.username && ` · @${peerUser.username}`}
                </p>
              </>
            )}
            {isGroup && (
              <p className="mt-1 text-body text-ink-2">
                Group · {conv.members.length} member{conv.members.length === 1 ? "" : "s"}
              </p>
            )}
            {isGroup && conv.description && <p className="mt-2 max-w-sm text-body-sm text-ink-2">{conv.description}</p>}

            {!note && (
              <div className="mt-6 flex gap-2">
                <QuickAction icon={<Video size={20} />} label="Video" onClick={() => comingSoon("Video calls")} />
                <QuickAction icon={<Phone size={18} />} label="Audio" onClick={() => comingSoon("Voice calls")} />
                <QuickAction
                  icon={conv.is_muted ? <BellOff size={18} /> : <Bell size={18} />}
                  label={conv.is_muted ? "Unmute" : "Mute"}
                  onClick={() => updatePrefs(conv, { is_muted: !conv.is_muted })}
                />
              </div>
            )}
          </div>

          {!conv.is_member && (
            <p className="mb-4 rounded-xl bg-field px-4 py-3 text-center text-body-sm text-ink-2">You&apos;re no longer a member of this group.</p>
          )}

          {!note && (
            <Section>
              <label className="flex items-center gap-3 py-2">
                <Timer size={20} className="text-ink-2" />
                <span className="flex-1">
                  <span className="block">Disappearing messages</span>
                  {!canEdit && <span className="block text-body-sm text-ink-3">Only admins can change this</span>}
                </span>
                <select
                  className="input h-8 w-auto pr-8"
                  value={conv.disappearing_seconds ?? 0}
                  disabled={!canEdit}
                  onChange={(e) => setTimer(Number(e.target.value))}
                  aria-label="Disappearing messages timer"
                >
                  {TIMER_OPTIONS.map((o) => (
                    <option key={o.seconds} value={o.seconds}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </Section>
          )}

          {peer && (
            <Section>
              <button className="row -mx-3 w-[calc(100%+1.5rem)]" onClick={() => openModal({ kind: "safety-number", convId: conv.id })}>
                <ShieldCheck size={20} className="text-ink-2" />
                <span>View safety number</span>
              </button>
              {isContact ? (
                <button
                  className="row -mx-3 w-[calc(100%+1.5rem)]"
                  onClick={() =>
                    run(async () => {
                      await api.removeContact(peer.id);
                      useChat.getState().setContacts(await api.contacts());
                    }, "Removed from contacts")
                  }
                >
                  <UserMinus size={20} className="text-ink-2" />
                  <span>Remove from contacts</span>
                </button>
              ) : (
                <button
                  className="row -mx-3 w-[calc(100%+1.5rem)]"
                  onClick={() => run(async () => useChat.getState().addContact(await api.addContact(peerUser!.phone)), "Added to contacts")}
                >
                  <UserPlus size={20} className="text-ink-2" />
                  <span>Add to contacts</span>
                </button>
              )}
            </Section>
          )}

          {isGroup && (
            <Section title={`${conv.members.length} member${conv.members.length === 1 ? "" : "s"}`}>
              {canEdit && (
                <button className="row -mx-3 w-[calc(100%+1.5rem)]" onClick={() => openModal({ kind: "add-members", convId: conv.id })}>
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-field">
                    <UserPlus size={18} />
                  </span>
                  <span className="font-medium">Add members</span>
                </button>
              )}
              {[...conv.members]
                .sort((a, b) => Number(b.user.id === ctx.meId) - Number(a.user.id === ctx.meId) || Number(b.role === "admin") - Number(a.role === "admin"))
                .map((m) => (
                  <MemberRow key={m.user.id} member={m} conv={conv} />
                ))}
            </Section>
          )}

          {isGroup && conv.is_member && (
            <Section>
              <button className="row -mx-3 w-[calc(100%+1.5rem)] text-danger" onClick={() => confirmLeaveGroup(conv)}>
                <LogOut size={20} />
                <span>Leave group</span>
              </button>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
