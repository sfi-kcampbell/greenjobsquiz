import type { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { clientIpHash } from "@/lib/rate-limit/fixed-window";
import { checkWriteOrigin, identify, rateLimit, respond, setVisitorCookie } from "@/lib/public/http";
import { saveAnswers } from "@/lib/public/sessions";
import type { PublicQuiz } from "@/lib/public/structure";

/** Shared by the single-answer and batch endpoints. */
export async function saveAndRespond(
  req: NextRequest,
  quiz: PublicQuiz,
  input: {
    sessionKey?: string;
    entries: { questionId: number; answerIds: number[] }[];
    clientRevision?: number;
    currentIndex?: number;
  },
) {
  const identity = identify(req, input.sessionKey);
  await checkWriteOrigin(req, identity);
  await rateLimit("answer", identity.tokenHash);

  const result = await saveAnswers(db, quiz, {
    tokenHash: identity.tokenHash,
    entries: input.entries,
    clientRevision: input.clientRevision,
    currentIndex: input.currentIndex,
    ipHash: await clientIpHash(),
  });

  const body = {
    revision: result.revision,
    stale: result.stale,
    // Full answers only when the client is out of date, so it can reconcile.
    ...(result.stale ? { answers: result.view.answers } : {}),
    answeredCount: result.view.answeredCount,
    total: result.view.total,
    attemptNo: result.view.attemptNo,
    // Returned once, when the respondent's token is created.
    ...(result.newToken ? { sessionKey: result.newToken } : {}),
  };
  const res = await respond(req, body, { status: result.newToken ? 201 : 200 });
  if (result.newToken) setVisitorCookie(res, req, result.newToken);
  return res;
}
