import type { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { notFound } from "@/lib/public/errors";
import { preflight, route } from "@/lib/public/http";
import { getPublishedQuiz } from "@/lib/public/structure";
import { structureResponse } from "../../structure-response";

export const dynamic = "force-dynamic";

export const GET = route(async (req: NextRequest, ctx: RouteContext<"/api/v1/quizzes/by-slug/[slug]">) => {
  const { slug } = await ctx.params;
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) throw notFound();
  const quiz = await getPublishedQuiz(db, { slug });
  if (!quiz) throw notFound();
  return structureResponse(req, quiz);
});

export const OPTIONS = preflight;
