/** Uploads an image to /api/admin/media (staff only). Throws an Error with a message people can act on. */
export type UploadedImage = { id: string; url: string; width: number; height: number };

export const ACCEPTED_IMAGE_TYPES = "image/png,image/jpeg,image/webp,image/gif";

export async function uploadImage(file: File, quizId?: number): Promise<UploadedImage> {
  if (file.size > 2 * 1024 * 1024) {
    throw new Error(`Images can be up to 2 MB. This one is ${(file.size / 1024 / 1024).toFixed(1)} MB.`);
  }
  const body = new FormData();
  body.append("file", file);
  if (quizId) body.append("quizId", String(quizId));
  let res: Response;
  try {
    res = await fetch("/api/admin/media", { method: "POST", body });
  } catch {
    throw new Error("The upload didn't reach the server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "The image couldn't be uploaded.");
  return data as UploadedImage;
}
