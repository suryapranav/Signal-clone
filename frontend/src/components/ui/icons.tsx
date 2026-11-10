// Icons drawn to match Signal's own symbol set where lucide has no close
// equivalent. Same 24×24 grid and round joins as lucide, so they sit together.

import type { ReactNode } from "react";

interface IconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
}

function Svg({ size = 20, strokeWidth = 1.75, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

/** Signal's round chat bubble with its tail at the bottom left; filled when active. */
export function ChatBubbleIcon({ filled = false, ...props }: IconProps & { filled?: boolean }) {
  return (
    <Svg {...props}>
      <path d="M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.6 20.4l4.2-1.1A8.5 8.5 0 1 0 12 3.5Z" fill={filled ? "currentColor" : "none"} />
    </Svg>
  );
}

/** Signal's Stories icon: a card with another card peeking out behind it. */
export function StoriesIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="9" y="3" width="11" height="18" rx="2.6" />
      <path d="M6.6 5.6 4.6 6.4a1.2 1.2 0 0 0-.7 1.4l2.8 10.6" />
    </Svg>
  );
}

/** Signal's Appearance icon: a scalloped badge around a half-filled circle. */
export function AppearanceIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 2.4l2.95 2.49 3.84.32.32 3.84L21.6 12l-2.49 2.95-.32 3.84-3.84.32L12 21.6l-2.95-2.49-3.84-.32-.32-3.84L2.4 12l2.49-2.95.32-3.84 3.84-.32Z" />
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 7.8a4.2 4.2 0 0 1 0 8.4Z" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Signal's Linked devices icon: a laptop with a phone in front of it. */
export function LinkedDevicesIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13 17H3.5a1 1 0 0 1-1-1v-.5h10.5" />
      <path d="M4.5 15.5V6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2V8" />
      <rect x="15" y="10" width="6.5" height="10.5" rx="1.6" />
      <path d="M17.5 18.2h1.5" />
    </Svg>
  );
}

const GEAR =
  "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z";

/** Settings gear. Filled with a cut-out centre when its tab is active, as in Signal. */
export function GearIcon({ filled = false, ...props }: IconProps & { filled?: boolean }) {
  return (
    <Svg {...props}>
      <path d={GEAR} fill={filled ? "currentColor" : "none"} />
      <circle cx="12" cy="12" r="3" fill={filled ? "var(--selected)" : "none"} stroke={filled ? "none" : "currentColor"} />
    </Svg>
  );
}

/** Phone handset; filled when the Calls tab is active. */
export function PhoneIcon({ filled = false, ...props }: IconProps & { filled?: boolean }) {
  return (
    <Svg {...props}>
      <path
        d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384Z"
        fill={filled ? "currentColor" : "none"}
      />
    </Svg>
  );
}
