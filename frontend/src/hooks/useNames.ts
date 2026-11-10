import { useMemo } from "react";
import { useChat } from "@/store/chat";
import type { NameContext } from "@/lib/names";

/** Everything name helpers need, memoised so components re-render only when
 *  users or nicknames actually change. */
export function useNames(): NameContext {
  const meId = useChat((s) => s.me?.id ?? -1);
  const users = useChat((s) => s.users);
  const nicknames = useChat((s) => s.nicknames);
  return useMemo(() => ({ meId, users, nicknames }), [meId, users, nicknames]);
}
