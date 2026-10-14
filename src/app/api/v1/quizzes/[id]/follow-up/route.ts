import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { checkWriteOrigin, identify, loadPublishedQuiz, preflight, rateLimit, readBody, respond, route } from "@/lib/public/http";
import { saveFollowUp } from "@/lib/public/sessions";

export const dynamic = "force-dynamic";

const body = z.object({
  answers: z
    .array(z.object({ questionId: z.number().int().positive(), answerIds: z.array(z.number().int().positive()).max(50) }))
    .max(200),
});

/**
 * Follow-up answers, sent after the result (never scored). Saved to the
 * respondent's latest submission; sending again replaces them.
 */
export const POST = route(async (req: NextRequest, ctx: RouteContext<"/api/v1/quizzes/[id]/follow-up">) => {
  const quiz = await loadPublishedQuiz((await ctx.params).id, req);
  const input = await readBody(req, body);
  const identity = identify(req);
  await checkWriteOrigin(req, identity);
  await rateLimit("submit", identity.tokenHash);
  const followUp = await saveFollowUp(db, quiz, { tokenHash: identity.tokenHash, entries: input.answers });
  return respond(req, { followUp });
});

export const OPTIONS = preflight;
