import { useState } from "react";

// Settings toggles, kept in this browser's localStorage under the signed-in
// user's id ("signal.u12.pref.enter-sends"). Several accounts can share one
// browser (sign out of Alice, sign in as Bob), so each account keeps its own
// choices instead of inheriting the previous user's.

let owner: number | null = null;

/** Called when the signed-in user changes (null after signing out). */
export function setPrefsOwner(userId: number | null) {
  owner = userId;
}

/** Storage key for one of the signed-in user's settings. */
export function userKey(name: string): string {
  return `signal.${owner == null ? "signed-out" : `u${owner}`}.${name}`;
}

export function readUserSetting(name: string): string | null {
  try {
    return localStorage.getItem(userKey(name));
  } catch {
    return null; // storage unavailable (private mode)
  }
}

export function writeUserSetting(name: string, value: string) {
  try {
    localStorage.setItem(userKey(name), value);
  } catch {
    /* storage unavailable: the setting lasts until reload */
  }
}

export function getPref(key: string, fallback: boolean): boolean {
  const v = readUserSetting(`pref.${key}`);
  return v === null ? fallback : v === "1";
}

export function usePref(key: string, fallback: boolean): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(() => getPref(key, fallback));
  return [
    value,
    (v) => {
      setValue(v);
      writeUserSetting(`pref.${key}`, v ? "1" : "0");
    },
  ];
}
