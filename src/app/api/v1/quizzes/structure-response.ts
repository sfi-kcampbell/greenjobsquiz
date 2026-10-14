import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { notModified, respond } from "@/lib/public/http";
import type { PublicQuiz } from "@/lib/public/structure";

/**
 * Structure is identical for everyone: cacheable, with an ETag from the
 * content itself (the published version plus live settings like the banner).
 */
export async function structureResponse(req: NextRequest, quiz: PublicQuiz) {
  const hash = createHash("sha256").update(JSON.stringify(quiz)).digest("base64url").slice(0, 16);
  const etag = `"q${quiz.id}-v${quiz.version}-${hash}"`;
  return (await notModified(req, etag)) ?? respond(req, { quiz }, { caching: { kind: "public", etag } });
}
