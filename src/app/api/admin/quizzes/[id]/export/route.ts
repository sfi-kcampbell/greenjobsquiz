import type { NextRequest } from "next/server";
import { getStaff } from "@/lib/auth/access";
import { recordAudit } from "@/lib/audit";
import { idSchema } from "@/lib/content/action-result";
import { ContentError } from "@/lib/content/errors";
import { exportQuiz } from "@/lib/content/quiz-file";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/** Download the quiz as {slug}.quiz.json. Staff only. Streamed, so large images don't hit response limits. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/admin/quizzes/[id]/export">) {
  const staff = await getStaff();
  if (!staff) return new Response("Sign in to export quizzes.", { status: 401 });
  const id = idSchema.safeParse((await ctx.params).id);
  if (!id.success) return new Response("Not found", { status: 404 });
  let file;
  try {
    file = await exportQuiz(db, id.data);
  } catch (error) {
    if (error instanceof ContentError) return new Response("Not found", { status: 404 });
    throw error;
  }
  await recordAudit(db, staff, { scope: "quiz", action: "quiz.export", quizId: id.data, summary: "Exported the quiz" });
  const bytes = new TextEncoder().encode(JSON.stringify(file, null, 2));
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 64 * 1024) controller.enqueue(bytes.subarray(i, i + 64 * 1024));
      controller.close();
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file.quiz.slug}.quiz.json"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
