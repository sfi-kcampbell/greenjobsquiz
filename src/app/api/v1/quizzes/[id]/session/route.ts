import type { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { identify, loadPublishedQuiz, preflight, respond, resultLinks, route } from "@/lib/public/http";
import { getSessionView } from "@/lib/public/sessions";

export const dynamic = "force-dynamic";

/** Progress for the current respondent. Creates nothing (crawlers make no rows). */
export const GET = route(async (req: NextRequest, ctx: RouteContext<"/api/v1/quizzes/[id]/session">) => {
  const quiz = await loadPublishedQuiz((await ctx.params).id);
  const view = await getSessionView(db, quiz, identify(req).tokenHash);
  return respond(req, {
    ...view,
    result: view.result ? { ...view.result, ...resultLinks(req, view.result.shareToken) } : null,
  });
});

export const OPTIONS = preflight;
