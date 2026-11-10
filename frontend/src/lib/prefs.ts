import { useState } from "react";

// Small per-device preferences (settings toggles). Kept in localStorage,
// so they belong to this browser only — like Signal's per-device settings.

const PREFIX = "signal.pref.";

export function getPref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

export function usePref(key: string, fallback: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(() => getPref(key, fallback));
  return [
    value,
    (v) => {
      setValue(v);
      try {
        localStorage.setItem(PREFIX + key, v ? "1" : "0");
      } catch {
        /* storage unavailable */
      }
    },
  ];
}
