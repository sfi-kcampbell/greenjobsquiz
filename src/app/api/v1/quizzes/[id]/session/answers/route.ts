import type { NextRequest } from "next/server";
import { z } from "zod";
import { loadPublishedQuiz, preflight, readBody, route } from "@/lib/public/http";
import { saveAndRespond } from "../save";

export const dynamic = "force-dynamic";

const body = z.object({
  /** For navigator.sendBeacon, which can't set the X-Quiz-Session header. */
  sessionKey: z.string().max(64).optional(),
  answers: z
    .array(z.object({ questionId: z.number().int().positive(), answerIds: z.array(z.number().int().positive()).max(50) }))
    .min(1)
    .max(200),
  clientRevision: z.number().int().nonnegative().optional(),
  currentIndex: z.number().int().min(0).max(1000).optional(),
  /** A quiz code (from the link or typed in); used only when this save starts a new attempt. */
  code: z.string().max(40).optional(),
});

/** Batch save, used to flush unsent answers when the page closes. */
export const POST = route(async (req: NextRequest, ctx: RouteContext<"/api/v1/quizzes/[id]/session/answers">) => {
  const quiz = await loadPublishedQuiz((await ctx.params).id);
  const input = await readBody(req, body);
  return saveAndRespond(req, quiz, {
    sessionKey: input.sessionKey,
    entries: input.answers,
    clientRevision: input.clientRevision,
    currentIndex: input.currentIndex,
    code: input.code,
  });
});

export const OPTIONS = preflight;
