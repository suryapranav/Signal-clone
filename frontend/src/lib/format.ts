// Time formatting in Signal's style: "Now", "5m", "3:41 PM", "Mon", "Oct 3".

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const time = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const monthDay = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const fullDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
const longDay = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function isSameDay(a: string, b: string) {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

/** Timestamp in the chat list. */
export function listTime(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  const diff = now - d.getTime();
  if (diff < MINUTE) return "Now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (startOfDay(d) === startOfDay(new Date(now))) return time.format(d);
  if (diff < 6 * DAY) return weekday.format(d);
  if (d.getFullYear() === new Date(now).getFullYear()) return monthDay.format(d);
  return fullDate.format(d);
}

/** Timestamp inside a message bubble. */
export function bubbleTime(iso: string, now = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  if (diff < MINUTE) return "Now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  return time.format(new Date(iso));
}

/** Date separator between messages from different days. */
export function dayLabel(iso: string, now = Date.now()): string {
  const day = startOfDay(new Date(iso));
  const today = startOfDay(new Date(now));
  if (day === today) return "Today";
  if (day === today - DAY) return "Yesterday";
  if (today - day < 6 * DAY) return new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(new Date(iso));
  if (new Date(iso).getFullYear() === new Date(now).getFullYear()) return longDay.format(new Date(iso));
  return fullDate.format(new Date(iso));
}

export function lastSeen(iso: string | null, now = Date.now()): string {
  if (!iso) return "";
  const diff = now - new Date(iso).getTime();
  if (diff < MINUTE) return "Last seen just now";
  if (diff < HOUR) return `Last seen ${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `Last seen ${Math.floor(diff / HOUR)}h ago`;
  return `Last seen ${monthDay.format(new Date(iso))}`;
}

export const TIMER_OPTIONS: { seconds: number; label: string; short: string }[] = [
  { seconds: 0, label: "Off", short: "Off" },
  { seconds: 30, label: "30 seconds", short: "30s" },
  { seconds: 5 * 60, label: "5 minutes", short: "5m" },
  { seconds: 60 * 60, label: "1 hour", short: "1h" },
  { seconds: 8 * 60 * 60, label: "8 hours", short: "8h" },
  { seconds: 24 * 60 * 60, label: "1 day", short: "1d" },
  { seconds: 7 * 24 * 60 * 60, label: "1 week", short: "1w" },
  { seconds: 28 * 24 * 60 * 60, label: "4 weeks", short: "4w" },
];

export function timerLabel(seconds: number | null | undefined, short = false): string {
  if (!seconds) return "Off";
  const opt = TIMER_OPTIONS.find((o) => o.seconds === seconds);
  if (opt) return short ? opt.short : opt.label;
  return `${seconds}s`;
}

/** Remaining time for a disappearing message, e.g. "4m". */
export function remaining(iso: string, now = Date.now()): string {
  const ms = Math.max(0, new Date(iso).getTime() - now);
  if (ms < MINUTE) return `${Math.max(1, Math.round(ms / 1000))}s`;
  if (ms < HOUR) return `${Math.ceil(ms / MINUTE)}m`;
  if (ms < DAY) return `${Math.ceil(ms / HOUR)}h`;
  return `${Math.ceil(ms / DAY)}d`;
}

export function formatPhone(e164: string): string {
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  if (m) return `+1 ${m[1]}-${m[2]}-${m[3]}`;
  const india = e164.match(/^\+91(\d{5})(\d{5})$/);
  if (india) return `+91 ${india[1]} ${india[2]}`;
  return e164;
}
