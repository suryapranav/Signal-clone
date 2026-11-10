"use client";

import { Camera, Trash2 } from "lucide-react";
import { useRef } from "react";
import { AVATAR_COLOR_KEYS, avatarColor } from "@/lib/colors";
import type { AvatarColor } from "@/lib/types";
import { cx, imageToAvatar } from "@/lib/utils";
import { toast } from "@/store/ui";
import { Avatar } from "../ui/Avatar";

/** Large avatar preview with photo upload and Signal's color swatches. */
export function AvatarPicker({
  name,
  color,
  photo,
  onColor,
  onPhoto,
  variant = "person",
}: {
  name: string;
  color: AvatarColor;
  photo: string | null;
  onColor: (c: AvatarColor) => void;
  onPhoto?: (dataUrl: string | null) => void;
  variant?: "person" | "group";
}) {
  const file = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <Avatar name={name || "?"} color={color} url={photo} size={88} variant={variant} />
        {onPhoto && (
          <button
            type="button"
            className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-chat bg-field text-ink hover:bg-selected"
            onClick={() => file.current?.click()}
            aria-label="Choose photo"
          >
            <Camera size={16} />
          </button>
        )}
        <input
          ref={file}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f || !onPhoto) return;
            try {
              onPhoto(await imageToAvatar(f));
            } catch {
              toast("Couldn't use that image", { tone: "error" });
            }
          }}
        />
      </div>
      {photo && onPhoto ? (
        <button type="button" className="flex items-center gap-1.5 text-body-sm text-ink-2 hover:text-danger" onClick={() => onPhoto(null)}>
          <Trash2 size={14} /> Remove photo
        </button>
      ) : (
        <div className="flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="Avatar color">
          {AVATAR_COLOR_KEYS.map((key) => {
            const { bg, fg } = avatarColor(key);
            return (
              <button
                type="button"
                key={key}
                role="radio"
                aria-checked={color === key}
                aria-label={`Color ${key}`}
                onClick={() => onColor(key)}
                className={cx("h-7 w-7 rounded-full ring-offset-2 ring-offset-chat", color === key && "ring-2 ring-accent")}
                style={{ background: bg, boxShadow: `inset 0 0 0 7px ${bg}, inset 0 0 0 14px ${fg}` }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
