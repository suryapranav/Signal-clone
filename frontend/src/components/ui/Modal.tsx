"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { cx } from "@/lib/utils";

interface ModalProps {
  title?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  /** Hide the title bar (for custom headers). */
  bare?: boolean;
}

/** Centered dialog with Signal's rounded card, dimmed backdrop and Esc to close. */
export function Modal({ title, onClose, children, footer, width = 420, bare }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[85vh] w-full animate-pop-in flex-col overflow-hidden rounded-2xl bg-pane shadow-pop"
        style={{ maxWidth: width }}
      >
        {!bare && (
          <div className="flex items-center justify-between px-5 pb-2 pt-4">
            <h2 className="text-[16px] font-semibold">{title}</h2>
            <button className="icon-btn -mr-2" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          </div>
        )}
        <div className={cx("min-h-0 flex-1 overflow-y-auto", !bare && "px-5 pb-4")}>{children}</div>
        {footer && <div className="flex justify-end gap-2 px-5 pb-5 pt-1">{footer}</div>}
      </div>
    </div>
  );
}
