import { useEffect, useState } from "react";

/** Current time, refreshed every `intervalMs`, for relative timestamps
 *  ("5m") and disappearing-message countdowns. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
