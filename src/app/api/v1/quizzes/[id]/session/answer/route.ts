import type { NextRequest } from "next/server";
import { z } from "zod";
import { loadPublishedQuiz, preflight, readBody, route } from "@/lib/public/http";
import { saveAndRespond } from "../save";

export const dynamic = "force-dynamic";

const body = z.object({
  questionId: z.number().int().positive(),
  answerIds: z.array(z.number().int().positive()).max(50),
  clientRevision: z.number().int().nonnegative().optional(),
  currentIndex: z.number().int().min(0).max(1000).optional(),
  /** A quiz code (from the link or typed in); used only when this save starts a new attempt. */
  code: z.string().max(40).optional(),
});

/** Saves one question's answer. The first write creates the session. */
export const PUT = route(async (req: NextRequest, ctx: RouteContext<"/api/v1/quizzes/[id]/session/answer">) => {
  const quiz = await loadPublishedQuiz((await ctx.params).id);
  const input = await readBody(req, body);
  return saveAndRespond(req, quiz, {
    entries: [{ questionId: input.questionId, answerIds: input.answerIds }],
    clientRevision: input.clientRevision,
    currentIndex: input.currentIndex,
    code: input.code,
  });
});

export const OPTIONS = preflight;
