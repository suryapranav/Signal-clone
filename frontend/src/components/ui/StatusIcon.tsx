import type { ClientMessageStatus } from "@/lib/types";

const LABELS: Record<ClientMessageStatus, string> = {
  sending: "Sending",
  failed: "Not sent",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
};

function Check({ cx }: { cx: number }) {
  return <path d={`M${cx - 2.6} 6.1l1.8 1.8 3.4-3.6`} fill="none" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />;
}

/**
 * Signal's receipt indicators, drawn in currentColor:
 *   sending   — dashed circle
 *   sent      — one outlined circle with a check
 *   delivered — two overlapping outlined circles with checks
 *   read      — two filled circles with checks
 */
export function StatusIcon({ status, className }: { status: ClientMessageStatus; className?: string }) {
  if (status === "failed") return null;
  const label = LABELS[status];

  if (status === "sending" || status === "sent") {
    return (
      <svg viewBox="0 0 12 12" width="12" height="12" className={className} role="img" aria-label={label}>
        <title>{label}</title>
        <circle cx="6" cy="6" r="5.25" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray={status === "sending" ? "2 1.6" : undefined} />
        {status === "sent" && <g stroke="currentColor"><Check cx={6} /></g>}
      </svg>
    );
  }

  const filled = status === "read";
  return (
    <svg viewBox="0 0 18 12" width="18" height="12" className={className} role="img" aria-label={label}>
      <title>{label}</title>
      {[6, 12].map((c) =>
        filled ? (
          <g key={c}>
            <circle cx={c} cy="6" r="5.4" fill="currentColor" />
            <g stroke="var(--status-check, #fff)"><Check cx={c} /></g>
          </g>
        ) : (
          <g key={c} stroke="currentColor">
            {/* back circle is clipped behind the front one */}
            <circle cx={c} cy="6" r="5.25" fill={c === 12 ? "var(--status-bg, transparent)" : "none"} strokeWidth="1.2" />
            <Check cx={c} />
          </g>
        ),
      )}
    </svg>
  );
}
