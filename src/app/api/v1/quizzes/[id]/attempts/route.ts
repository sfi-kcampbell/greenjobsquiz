import type { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { identify, loadPublishedQuiz, preflight, respond, resultLinks, route } from "@/lib/public/http";
import { listAttempts } from "@/lib/public/sessions";

export const dynamic = "force-dynamic";

/** The current respondent's submitted attempts at this quiz. */
export const GET = route(async (req: NextRequest, ctx: RouteContext<"/api/v1/quizzes/[id]/attempts">) => {
  const quiz = await loadPublishedQuiz((await ctx.params).id);
  const attempts = await listAttempts(db, quiz.id, identify(req).tokenHash);
  return respond(req, {
    attempts: attempts.map((a) => ({ ...a, ...(a.shareToken ? resultLinks(req, a.shareToken) : {}) })),
  });
});

export const OPTIONS = preflight;
