import type { NextRequest } from "next/server";
import { loadPublishedQuiz, preflight, route } from "@/lib/public/http";
import { structureResponse } from "../structure-response";

export const dynamic = "force-dynamic";

export const GET = route(async (req: NextRequest, ctx: RouteContext<"/api/v1/quizzes/[id]">) =>
  structureResponse(req, await loadPublishedQuiz((await ctx.params).id)),
);

export const OPTIONS = preflight;
