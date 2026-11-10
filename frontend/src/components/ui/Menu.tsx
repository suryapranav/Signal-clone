"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/lib/utils";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  hidden?: boolean;
}

/** Click-to-open dropdown menu, closed by outside click or Escape. */
export function Menu({
  trigger,
  items,
  align = "right",
  className,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  items: MenuItem[];
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);

  // Open upwards when there isn't room below (e.g. the newest message, above the composer).
  // Scrolling areas like the message list clip their content, so measure against them.
  useLayoutEffect(() => {
    if (!open || !list.current || !ref.current) return;
    const bounds = ref.current.closest("[role=log]")?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
    const trigger = ref.current.getBoundingClientRect();
    const height = list.current.offsetHeight;
    setUp(trigger.bottom + height + 8 > bounds.bottom && trigger.top - height - 8 > bounds.top);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={ref} className={cx("relative", className)}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          ref={list}
          role="menu"
          className={cx(
            "absolute z-40 min-w-[200px] animate-pop-in rounded-xl bg-pane py-1.5 shadow-pop",
            up ? "bottom-full mb-1" : "top-full mt-1",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {items
            .filter((i) => !i.hidden)
            .map((item) => (
              <button
                key={item.label}
                role="menuitem"
                className={cx(
                  "flex w-full items-center gap-3 px-3.5 py-2 text-left text-body hover:bg-hover",
                  item.danger ? "text-danger" : "text-ink",
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.icon && <span className="text-ink-2 [&>svg]:h-[18px] [&>svg]:w-[18px]">{item.icon}</span>}
                {item.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
