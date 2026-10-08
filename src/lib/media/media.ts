/**
 * Uploaded images, stored in Postgres (bytea). The same bytes are stored once
 * (sha256), and an id's bytes never change, so they can be cached forever.
 */
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Executor } from "@/lib/db/create";
import { media } from "@/lib/db/schema";
import { imageInfo, MAX_IMAGE_BYTES } from "./image-info";

export const MEDIA_PATH = "/media/";
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type StoredMedia = { id: string; url: string; width: number; height: number; contentType: string };

export class MediaError extends Error {
  constructor(
    readonly code: "too_large" | "unsupported" | "empty",
    message: string,
  ) {
    super(message);
    this.name = "MediaError";
  }
}

export const mediaUrl = (id: string) => `${MEDIA_PATH}${id}`;

export async function storeMedia(
  db: Executor,
  input: { bytes: Uint8Array; filename?: string | null; quizId?: number | null; createdBy?: string | null },
): Promise<StoredMedia> {
  if (input.bytes.length === 0) throw new MediaError("empty", "That file is empty.");
  if (input.bytes.length > MAX_IMAGE_BYTES) {
    throw new MediaError("too_large", `Images can be up to ${MAX_IMAGE_BYTES / 1024 / 1024} MB. This one is ${(input.bytes.length / 1024 / 1024).toFixed(1)} MB.`);
  }
  const info = imageInfo(input.bytes);
  if (!info) throw new MediaError("unsupported", "Use a PNG, JPEG, WebP or GIF image. (SVG isn't allowed.)");

  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const [inserted] = await db
    .insert(media)
    .values({
      quizId: input.quizId ?? null,
      contentType: info.contentType,
      bytes: Buffer.from(input.bytes),
      byteSize: input.bytes.length,
      width: info.width,
      height: info.height,
      filename: input.filename?.slice(0, 200) ?? null,
      sha256,
      createdBy: input.createdBy ?? null,
    })
    .onConflictDoNothing({ target: media.sha256 })
    .returning({ id: media.id });
  const id =
    inserted?.id ?? (await db.select({ id: media.id }).from(media).where(eq(media.sha256, sha256)).limit(1))[0].id;
  return { id, url: mediaUrl(id), width: info.width, height: info.height, contentType: info.contentType };
}

export async function getMedia(db: Executor, id: string) {
  if (!UUID_PATTERN.test(id)) return null;
  const [row] = await db
    .select({ contentType: media.contentType, bytes: media.bytes, byteSize: media.byteSize })
    .from(media)
    .where(eq(media.id, id))
    .limit(1);
  return row ?? null;
}

export async function getMediaMeta(db: Executor, id: string) {
  if (!UUID_PATTERN.test(id)) return null;
  const [row] = await db
    .select({ id: media.id, width: media.width, height: media.height })
    .from(media)
    .where(eq(media.id, id))
    .limit(1);
  return row ?? null;
}
