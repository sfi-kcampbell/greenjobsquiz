import type { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { preflight, respond, route } from "@/lib/public/http";
import { listPublishedQuizzes } from "@/lib/public/structure";

export const dynamic = "force-dynamic";

/** Published quizzes only. */
export const GET = route(async (req: NextRequest) =>
  respond(req, { quizzes: await listPublishedQuizzes(db) }, { caching: { kind: "public", maxAge: 60 } }),
);

export const OPTIONS = preflight;
