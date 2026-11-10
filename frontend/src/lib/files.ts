import type { Attachment } from "./types";
import { IMAGE_TYPES, type OutgoingFile } from "@/store/chat";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Validate a picked/pasted/dropped file and measure images, so bubbles can
 *  reserve the right space before the image loads (no scroll jumps). */
export async function prepareFile(file: File): Promise<OutgoingFile> {
  if (file.size === 0) throw new Error("That file is empty");
  if (file.size > MAX_FILE_BYTES) throw new Error(`Files can be up to ${formatBytes(MAX_FILE_BYTES)}`);
  let size: OutgoingFile["size"] = null;
  if (IMAGE_TYPES.has(file.type)) {
    try {
      const bitmap = await createImageBitmap(file);
      size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
    } catch {
      /* unreadable image: send it as a plain file */
    }
  }
  return { file, size };
}

/** Short label used in chat previews, quotes and notifications. */
export function attachmentLabel(att: Pick<Attachment, "is_image" | "filename">): string {
  return att.is_image ? "📷 Photo" : `📎 ${att.filename}`;
}
