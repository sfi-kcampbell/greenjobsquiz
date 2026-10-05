import type { NextRequest } from "next/server";
import { notModified, respond } from "@/lib/public/http";
import type { PublicQuiz } from "@/lib/public/structure";

/** Structure is identical for everyone: cacheable, with an ETag from structure_version. */
export async function structureResponse(req: NextRequest, quiz: PublicQuiz) {
  const etag = `"q${quiz.id}-v${quiz.structureVersion}"`;
  return (await notModified(req, etag)) ?? respond(req, { quiz }, { caching: { kind: "public", etag } });
}
