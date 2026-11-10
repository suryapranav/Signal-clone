"use client";

import { FileText, Mic, Paperclip, SendHorizontal, Smile, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { comingSoon } from "@/lib/actions";
import { formatBytes, prepareFile } from "@/lib/files";
import { messageSummary, userName, type NameContext } from "@/lib/names";
import { realtime } from "@/lib/socket";
import type { Conversation } from "@/lib/types";
import { useChat } from "@/store/chat";
import { toast, useUI } from "@/store/ui";

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
  const send = useChat((s) => s.send);
  const pending = useUI((s) => (s.pendingFile?.convId === conv.id ? s.pendingFile.file : null));
  const setPendingFile = useUI((s) => s.setPendingFile);
  const picker = useRef<HTMLInputElement>(null);
  const typing = useTypingSignal(conv.id);
  const canSend = !!text.trim() || !!pending;

  useEffect(() => {
    drafts.set(conv.id, text);
  }, [conv.id, text]);

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

  function submit() {
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
      e.preventDefault();
      submit();
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
    <div className="flex shrink-0 items-end gap-1 px-2 pb-3 pt-2 md:px-3">
      <div className="relative">
        <button className="icon-btn h-9 w-9" onClick={() => setEmojiOpen((o) => !o)} aria-label="Emoji" title="Emoji">
          <Smile size={20} strokeWidth={1.75} />
        </button>
        {emojiOpen && <EmojiPicker onPick={insertEmoji} onClose={() => setEmojiOpen(false)} />}
      </div>

      <div className="min-w-0 flex-1 rounded-[18px] bg-field">
        {replyTo && (
          <div className="flex items-start gap-2 px-2 pt-2">
            <div className="min-w-0 flex-1 rounded-lg border-l-[3px] border-accent bg-chat px-2.5 py-1.5">
              <div className="text-[13px] font-semibold leading-4">{replyTo.sender_id === ctx.meId ? "You" : userName(ctx, replyTo.sender_id)}</div>
              <div className="mt-0.5 line-clamp-2 text-[13px] leading-[18px] text-ink-2">{messageSummary(replyTo)}</div>
            </div>
            <button className="icon-btn h-6 w-6" onClick={() => setReplyTo(null)} aria-label="Cancel reply">
              <X size={14} />
            </button>
          </div>
        )}
        {pending && <PendingFile file={pending.file} onRemove={() => setPendingFile(null)} />}
        <textarea
          ref={input}
          rows={1}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (e.target.value) typing.ping();
            else typing.stop();
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={typing.stop}
          placeholder={pending ? "Add a message" : "Message"}
          aria-label="Message"
          className="block max-h-[140px] w-full resize-none bg-transparent px-3.5 py-2 text-body text-ink outline-none placeholder:text-ink-3"
        />
      </div>

      <button className="icon-btn h-9 w-9" onClick={() => picker.current?.click()} aria-label="Attach file" title="Attach file">
        <Paperclip size={19} strokeWidth={1.75} />
      </button>
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
      {canSend ? (
        <button key="send" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white hover:bg-accent-hover" onClick={submit} aria-label="Send" title="Send (Enter)">
          <SendHorizontal size={18} />
        </button>
      ) : (
        <button key="mic" className="icon-btn h-9 w-9" onClick={() => comingSoon("Voice messages")} aria-label="Voice message" title="Voice message">
          <Mic size={19} strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}
