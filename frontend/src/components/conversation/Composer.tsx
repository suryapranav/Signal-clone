"use client";

import { Check, FileText, Mic, Pencil, Plus, SendHorizontal, Smile, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { comingSoon } from "@/lib/actions";
import { formatBytes, prepareFile } from "@/lib/files";
import type { NameContext } from "@/lib/names";
import { getPref, usePref } from "@/lib/prefs";
import { realtime } from "@/lib/socket";
import type { Conversation } from "@/lib/types";
import { useChat } from "@/store/chat";
import { toast, useUI } from "@/store/ui";
import { QuotePanel } from "./QuotePanel";

/** Validate a file and stage it in the composer of the given chat. */
export async function attachFile(convId: number, file: File) {
  try {
    useUI.getState().setPendingFile({ convId, file: await prepareFile(file) });
  } catch (e) {
    toast((e as Error).message, { tone: "error" });
  }
}

function PendingFile({ file, onRemove }: { file: File; onRemove: () => void }) {
  const preview = useMemo(() => (file.type.startsWith("image/") ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);
  return (
    <div className="flex items-center gap-2 px-2 pt-2">
      <div className="relative">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local blob preview
          <img src={preview} alt="" className="h-16 w-16 rounded-lg object-cover" />
        ) : (
          <div className="flex h-12 items-center gap-2 rounded-lg bg-chat px-3">
            <FileText size={18} className="text-ink-2" />
            <span className="max-w-[200px] truncate text-body-sm">{file.name}</span>
            <span className="text-body-sm text-ink-3">{formatBytes(file.size)}</span>
          </div>
        )}
        <button
          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-toast text-toast-ink"
          onClick={onRemove}
          aria-label="Remove attachment"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
}

const EMOJI = "😀 😂 🥲 😊 😍 🥰 😘 😎 🤔 😅 😭 😡 👍 👎 👏 🙏 🙌 💪 🤝 👋 ❤️ 🔥 ✨ 🎉 💯 ✅ 👀 🤣 😴 🤯 😬 🥳 ☕ 🍕 🍫 🚀".split(" ");
const TYPING_REFRESH_MS = 3000; // re-announce while typing continues
const TYPING_IDLE_MS = 4000; // stop announcing after this much silence

function EmojiPicker({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [onClose]);
  return (
    <div ref={ref} className="absolute bottom-full left-0 z-30 mb-2 grid w-[296px] animate-pop-in grid-cols-8 gap-0.5 rounded-2xl bg-pane p-2 shadow-pop">
      {EMOJI.map((e) => (
        <button key={e} type="button" className="flex h-8 w-8 items-center justify-center rounded-lg text-[20px] hover:bg-hover" onClick={() => onPick(e)} aria-label={e}>
          {e}
        </button>
      ))}
    </div>
  );
}

/** Announces typing state over the socket: start on first keystroke,
 *  refresh every few seconds, stop after idle or on send. */
function useTypingSignal(convId: number) {
  const lastSent = useRef(0);
  const idle = useRef<ReturnType<typeof setTimeout>>(undefined);

  const stop = () => {
    clearTimeout(idle.current);
    if (lastSent.current) {
      realtime.send({ type: "typing", conversation_id: convId, is_typing: false });
      lastSent.current = 0;
    }
  };
  const ping = () => {
    // With typing indicators off (Settings → Privacy) we don't announce our own typing.
    if (!getPref("typing-indicators", true)) return;
    const now = Date.now();
    if (now - lastSent.current > TYPING_REFRESH_MS) {
      realtime.send({ type: "typing", conversation_id: convId, is_typing: true });
      lastSent.current = now;
    }
    clearTimeout(idle.current);
    idle.current = setTimeout(stop, TYPING_IDLE_MS);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => stop, [convId]);
  return { ping, stop };
}

const drafts = new Map<number, string>(); // per-chat unsent text, kept while switching chats

export function Composer({ conv, ctx }: { conv: Conversation; ctx: NameContext }) {
  const [text, setText] = useState(() => drafts.get(conv.id) ?? "");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const replyTo = useUI((s) => (s.replyTo?.conversation_id === conv.id ? s.replyTo : null));
  const setReplyTo = useUI((s) => s.setReplyTo);
  const editing = useUI((s) => (s.editing?.conversation_id === conv.id ? s.editing : null));
  const setEditing = useUI((s) => s.setEditing);
  const [enterSends] = usePref("enter-sends", true);
  const [spellCheck] = usePref("spell-check", true);
  const draftBeforeEdit = useRef<string | null>(null);
  const send = useChat((s) => s.send);
  const pending = useUI((s) => (s.pendingFile?.convId === conv.id ? s.pendingFile.file : null));
  const setPendingFile = useUI((s) => s.setPendingFile);
  const picker = useRef<HTMLInputElement>(null);
  const typing = useTypingSignal(conv.id);
  const canSend = editing ? !!text.trim() || !!editing.attachment : !!text.trim() || !!pending;

  // Editing loads the message's text into the composer; the unsent draft comes back afterwards.
  useEffect(() => {
    if (editing) {
      draftBeforeEdit.current ??= text;
      setText(editing.body);
      requestAnimationFrame(() => {
        const el = input.current;
        el?.focus();
        el?.setSelectionRange(el.value.length, el.value.length);
      });
    } else if (draftBeforeEdit.current !== null) {
      setText(draftBeforeEdit.current);
      draftBeforeEdit.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the edited message changes
  }, [editing?.id]);

  useEffect(() => {
    if (!editing) drafts.set(conv.id, text);
  }, [conv.id, text, editing]);

  // Grow with content up to ~6 lines.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  useEffect(() => {
    input.current?.focus();
  }, [conv.id, replyTo?.id, pending]);

  async function saveEdit(message: NonNullable<typeof editing>) {
    const body = text.trim();
    if (!body && !message.attachment) return;
    if (body === message.body || (await useChat.getState().editMessage(message, body))) setEditing(null);
  }

  function submit() {
    if (editing) return void saveEdit(editing);
    const body = text.trim();
    if (!body && !pending) return;
    void send(conv.id, body, replyTo, pending);
    setText("");
    setReplyTo(null);
    setPendingFile(null);
    typing.stop();
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const file = [...e.clipboardData.files][0];
    if (file) {
      e.preventDefault();
      void attachFile(conv.id, file);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      // "Enter key sends" off (Settings → Chats): Enter is a new line and Ctrl/⌘ + Enter sends.
      if (!enterSends && !e.metaKey && !e.ctrlKey) return;
      e.preventDefault();
      submit();
    } else if (e.key === "Escape" && editing) {
      setEditing(null);
    } else if (e.key === "Escape" && replyTo) {
      setReplyTo(null);
    }
  }

  function insertEmoji(emoji: string) {
    const el = input.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setText(text.slice(0, start) + emoji + text.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  return (
    <div className="shrink-0 px-2 pb-3 pt-2 md:px-3">
      {/* Signal shows the message being replied to (or edited) as a full-width panel above the input row. */}
      {(editing || replyTo) && (
        <QuotePanel
          className="mb-2"
          quoted={(editing ?? replyTo)!}
          ctx={ctx}
          label={
            editing ? (
              <span className="flex items-center gap-1.5">
                <Pencil size={13} strokeWidth={2} /> Edit message
              </span>
            ) : undefined
          }
          onCancel={{
            label: editing ? "Cancel edit" : "Cancel reply",
            onClick: () => (editing ? setEditing(null) : setReplyTo(null)),
          }}
        />
      )}
      <div className="flex items-end gap-1">
        <div className="relative">
          <button className="icon-btn h-9 w-9" onClick={() => setEmojiOpen((o) => !o)} aria-label="Emoji" title="Emoji">
            <Smile size={20} strokeWidth={1.75} />
          </button>
          {emojiOpen && <EmojiPicker onPick={insertEmoji} onClose={() => setEmojiOpen(false)} />}
        </div>

        <div className="min-w-0 flex-1 rounded-[18px] bg-bubble-in">
          {pending && !editing && <PendingFile file={pending.file} onRemove={() => setPendingFile(null)} />}
          <textarea
            ref={input}
            rows={1}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (e.target.value && !editing) typing.ping();
              else typing.stop();
            }}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onBlur={typing.stop}
            placeholder={pending ? "Add a message" : "Message"}
            aria-label="Message"
            spellCheck={spellCheck}
            className="block max-h-[140px] w-full resize-none bg-transparent px-3.5 py-2 text-body text-ink outline-none placeholder:text-ink-3"
          />
        </div>

        <input
          ref={picker}
          type="file"
          hidden
          aria-label="Choose file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void attachFile(conv.id, file);
          }}
        />
        {editing ? (
          <button
            key="save"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
            onClick={submit}
            disabled={!canSend}
            aria-label="Save edit"
            title="Save edit"
          >
            <Check size={18} />
          </button>
        ) : canSend ? (
          <button key="send" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white hover:bg-accent-hover" onClick={submit} aria-label="Send" title="Send (Enter)">
            <SendHorizontal size={18} />
          </button>
        ) : (
          <button key="mic" className="icon-btn h-9 w-9" onClick={() => comingSoon("Voice messages")} aria-label="Voice message" title="Voice message">
            <Mic size={19} strokeWidth={1.75} />
          </button>
        )}
        {/* Attachments sit at the far right, behind Signal's "+". */}
        {!editing && (
          <button className="icon-btn h-9 w-9" onClick={() => picker.current?.click()} aria-label="Attach file" title="Attach file">
            <Plus size={22} strokeWidth={1.75} />
          </button>
        )}
      </div>
    </div>
  );
}
