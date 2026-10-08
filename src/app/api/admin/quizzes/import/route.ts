import { NextResponse, type NextRequest } from "next/server";
import { getStaff } from "@/lib/auth/access";
import { recordAudit } from "@/lib/audit";
import { ContentError } from "@/lib/content/errors";
import { importQuiz, parseQuizFile, QUIZ_FILE_MAX_BYTES } from "@/lib/content/quiz-file";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

const json = (status: number, body: unknown) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const tooLarge = `Quiz files can be up to ${QUIZ_FILE_MAX_BYTES / 1024 / 1024} MB. Make the images in it smaller and export again.`;

/** Import a quiz file (multipart field "file") as a new draft. Staff only. */
export async function POST(req: NextRequest) {
  const staff = await getStaff();
  if (!staff) return json(401, { error: "Sign in to import quizzes." });
  if (Number(req.headers.get("content-length") ?? 0) > QUIZ_FILE_MAX_BYTES + 64 * 1024) return json(413, { error: tooLarge });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { error: "Send the quiz file as a file upload." });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return json(400, { error: "Choose a quiz file (.quiz.json) to import." });
  if (file.size > QUIZ_FILE_MAX_BYTES) return json(413, { error: tooLarge });

  try {
    const id = await importQuiz(db, parseQuizFile(await file.text()), { createdBy: staff.email });
    await recordAudit(db, staff, { scope: "quiz", action: "quiz.import", quizId: id, summary: `Imported from ${file.name.slice(0, 120)}` });
    return json(201, { id, url: `/admin/quizzes/${id}` });
  } catch (error) {
    if (error instanceof ContentError) return json(422, { error: error.message });
    throw error;
  }
}
