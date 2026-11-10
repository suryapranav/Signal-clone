import { cx } from "@/lib/utils";

/** Three bouncing dots, used in the typing bubble and the chat list preview. */
export function TypingDots({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-[3px]", className)} aria-label="typing">
      {[0, 160, 320].map((delay) => (
        <span
          key={delay}
          className="h-[6px] w-[6px] animate-typing-dot rounded-full bg-current"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}
