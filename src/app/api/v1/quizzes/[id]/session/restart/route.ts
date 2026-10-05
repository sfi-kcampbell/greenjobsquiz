import type { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { clientIpHash } from "@/lib/rate-limit/fixed-window";
import { checkWriteOrigin, identify, loadPublishedQuiz, preflight, rateLimit, respond, route } from "@/lib/public/http";
import { restart } from "@/lib/public/sessions";

export const dynamic = "force-dynamic";

/** Starts a new attempt. Earlier attempts and submissions are kept. */
export const POST = route(async (req: NextRequest, ctx: RouteContext<"/api/v1/quizzes/[id]/session/restart">) => {
  const quiz = await loadPublishedQuiz((await ctx.params).id);
  const identity = identify(req);
  await checkWriteOrigin(req, identity);
  await rateLimit("restart", identity.tokenHash);
  return respond(req, await restart(db, quiz, identity.tokenHash, await clientIpHash()));
});

export const OPTIONS = preflight;
