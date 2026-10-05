import type { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { PublicError } from "@/lib/public/errors";
import { preflight, respond, resultLinks, route } from "@/lib/public/http";
import { getResultByShareToken } from "@/lib/public/sessions";
import { isToken } from "@/lib/public/tokens";

export const dynamic = "force-dynamic";

/** A shared result. The token is the credential; it's never indexed. */
export const GET = route(async (req: NextRequest, ctx: RouteContext<"/api/v1/results/[token]">) => {
  const { token } = await ctx.params;
  const result = isToken(token) ? await getResultByShareToken(db, token) : null;
  if (!result) throw new PublicError(404, "quiz_result_not_found", "That result link isn't valid.");
  const res = await respond(req, { result, ...resultLinks(req, token) });
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
});

export const OPTIONS = preflight;
