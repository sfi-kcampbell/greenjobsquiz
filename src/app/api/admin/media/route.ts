import { NextResponse, type NextRequest } from "next/server";
import { getStaff } from "@/lib/auth/access";
import { db } from "@/lib/db/client";
import { MAX_IMAGE_BYTES } from "@/lib/media/image-info";
import { MediaError, storeMedia } from "@/lib/media/media";

export const dynamic = "force-dynamic";

const json = (status: number, body: unknown) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Upload one image (multipart field "file"). Staff only. */
export async function POST(req: NextRequest) {
  const staff = await getStaff();
  if (!staff) return json(401, { error: "Sign in to upload images." });

  // Refuse obviously large bodies before reading them.
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_IMAGE_BYTES + 64 * 1024) {
    return json(413, { error: `Images can be up to ${MAX_IMAGE_BYTES / 1024 / 1024} MB.` });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { error: "Send the image as a file upload." });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return json(400, { error: "Choose an image to upload." });
  const quizId = Number(form.get("quizId"));

  try {
    const stored = await storeMedia(db, {
      bytes: new Uint8Array(await file.arrayBuffer()),
      filename: file.name,
      quizId: Number.isInteger(quizId) && quizId > 0 ? quizId : null,
      createdBy: staff.email,
    });
    return json(201, stored);
  } catch (error) {
    if (error instanceof MediaError) return json(error.code === "too_large" ? 413 : 415, { error: error.message });
    // A quiz id that doesn't exist (foreign key) is not worth failing the upload over.
    console.error("[media] Upload failed:", error);
    return json(500, { error: "The image couldn't be saved. Please try again." });
  }
}
