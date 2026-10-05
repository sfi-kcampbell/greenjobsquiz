import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { clientIpHash } from "@/lib/rate-limit/fixed-window";
import {
  checkWriteOrigin,
  identify,
  loadPublishedQuiz,
  preflight,
  rateLimit,
  readBody,
  respond,
  resultLinks,
  route,
} from "@/lib/public/http";
import { getResultByShareToken, submit } from "@/lib/public/sessions";

export const dynamic = "force-dynamic";

const body = z.object({
  email: z
    .union([z.email().max(200), z.literal("")])
    .optional()
    .transform((v) => v || null),
});

/** Scores the current attempt on the server and stores it. Idempotent. */
export const POST = route(async (req: NextRequest, ctx: RouteContext<"/api/v1/quizzes/[id]/submit">) => {
  const quiz = await loadPublishedQuiz((await ctx.params).id);
  const input = await readBody(req, body);
  const identity = identify(req);
  await checkWriteOrigin(req, identity);
  await rateLimit("submit", identity.tokenHash);

  const done = await submit(db, quiz, {
    tokenHash: identity.tokenHash,
    email: input.email,
    ipHash: await clientIpHash(),
    referrer: req.headers.get("referer"),
  });
  const result = await getResultByShareToken(db, done.shareToken);
  return respond(
    req,
    { shareToken: done.shareToken, ...resultLinks(req, done.shareToken), alreadySubmitted: done.alreadySubmitted, result },
    { status: done.alreadySubmitted ? 200 : 201 },
  );
});

export const OPTIONS = preflight;
