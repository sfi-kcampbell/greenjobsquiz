import type { NextRequest } from "next/server";
import { CODE_MESSAGES, resolveCode } from "@/lib/content/quiz-codes";
import { db } from "@/lib/db/client";
import { loadPublishedQuiz, preflight, rateLimit, respond, route } from "@/lib/public/http";

export const dynamic = "force-dynamic";

/** Checks a quiz code before starting (for the "Quiz code" box). Rate-limited against guessing. */
export const GET = route(async (req: NextRequest, ctx: RouteContext<"/api/v1/quizzes/[id]/codes/[code]">) => {
  const params = await ctx.params;
  const quiz = await loadPublishedQuiz(params.id);
  await rateLimit("code", null);
  const resolved = await resolveCode(db, quiz.id, decodeURIComponent(params.code));
  return respond(
    req,
    resolved.ok
      ? { valid: true, code: resolved.code }
      : { valid: false, reason: resolved.reason, message: CODE_MESSAGES[resolved.reason], opensAt: resolved.opensAt?.toISOString() ?? null },
  );
});

export const OPTIONS = preflight;
