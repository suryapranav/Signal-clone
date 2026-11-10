"use client";

import { useUI } from "@/store/ui";
import { cx } from "@/lib/utils";

/** Signal's toasts: small dark pills at the bottom center. */
export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  const dismiss = useUI((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            "pointer-events-auto flex max-w-md animate-toast-in items-center gap-4 rounded-xl px-4 py-2.5 text-body shadow-pop",
            t.tone === "error" ? "bg-danger text-white" : "bg-toast text-toast-ink",
          )}
          onClick={() => dismiss(t.id)}
        >
          <span className="min-w-0 truncate">{t.text}</span>
          {t.action && (
            <button
              className="shrink-0 font-semibold text-[#7ea6f7] hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                t.action!.onClick();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
