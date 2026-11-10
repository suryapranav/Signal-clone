import type { AvatarColor } from "./types";

/** Signal's avatar palette: a pale background with a saturated foreground
 *  for initials. Keys match the backend's `avatar_color` values. */
export const AVATAR_COLORS: Record<AvatarColor, { bg: string; fg: string }> = {
  A100: { bg: "#E3E3FE", fg: "#3838F5" },
  A110: { bg: "#DDE7FC", fg: "#1251D3" },
  A120: { bg: "#D8E8F0", fg: "#086DA0" },
  A130: { bg: "#CDE4CD", fg: "#067906" },
  A140: { bg: "#EAE0FD", fg: "#661AFF" },
  A150: { bg: "#F5E3FE", fg: "#9F00F0" },
  A160: { bg: "#F6D8EC", fg: "#B8057C" },
  A170: { bg: "#F5D7D7", fg: "#BE0404" },
  A180: { bg: "#FEF5D0", fg: "#836B01" },
  A190: { bg: "#EAE6D5", fg: "#7D6F40" },
  A200: { bg: "#D2D2DC", fg: "#4F4F6D" },
  A210: { bg: "#D7D7D9", fg: "#5C5C5C" },
};

export const AVATAR_COLOR_KEYS = Object.keys(AVATAR_COLORS) as AvatarColor[];

export function avatarColor(key: string | null | undefined) {
  return AVATAR_COLORS[(key as AvatarColor) ?? "A110"] ?? AVATAR_COLORS.A110;
}
