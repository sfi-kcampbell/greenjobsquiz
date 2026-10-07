import { NextResponse, type NextRequest } from "next/server";
import { parseListQuery } from "@/lib/admin/submissions";
import { getStaff } from "@/lib/auth/access";
import { db } from "@/lib/db/client";
import { BOM, csvRow, exportFilename } from "@/lib/export/csv";
import { answerDetails, exportBatches, LONG_HEADER, longRows, wideCategories, wideHeader, wideRow } from "@/lib/export/submissions-export";
import { getQuiz } from "@/lib/content/quizzes";

export const dynamic = "force-dynamic";
/**
 * Streams batch by batch, so memory stays flat. If exports ever outgrow the
 * function time limit, move them to a background job that writes the file to
 * Vercel Blob (see SPEC.md, "CSV export").
 */
export const maxDuration = 60;

const plain = (status: number, message: string) =>
  new NextResponse(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });

/** CSV of the Submissions list with the same filters. Super Admins only. */
export async function GET(req: NextRequest) {
  // Access first, before reading anything else.
  const staff = await getStaff();
  if (!staff) return plain(401, "Sign in to export submissions.");
  if (staff.role !== "super_admin") return plain(404, "Not found.");

  const params = Object.fromEntries(req.nextUrl.searchParams);
  const mode = params.mode === "wide" ? "wide" : "long";
  const query = parseListQuery(params);
  if (mode === "wide" && !query.quiz) return plain(400, "Choose a quiz to export one row per attempt (wide).");

  const quiz = query.quiz ? await getQuiz(db, query.quiz) : null;
  const cats = mode === "wide" ? await wideCategories(db, query) : [];
  const batches = exportBatches(db, query);
  const encoder = new TextEncoder();
  let started = false;

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!started) {
          started = true;
          controller.enqueue(encoder.encode(BOM + csvRow(mode === "wide" ? wideHeader(cats) : LONG_HEADER)));
          return;
        }
        const next = await batches.next();
        if (next.done) {
          controller.close();
          return;
        }
        const batch = next.value;
        let chunk = "";
        if (mode === "wide") {
          for (const s of batch) chunk += csvRow(wideRow(s, cats));
        } else {
          const details = await answerDetails(db, batch);
          for (const s of batch) for (const row of longRows(s, details)) chunk += csvRow(row);
        }
        controller.enqueue(encoder.encode(chunk));
      } catch (error) {
        console.error("[export] Failed while streaming:", error);
        controller.error(error);
      }
    },
    async cancel() {
      await batches.return(undefined);
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename(quiz?.slug ?? null, mode, new Date())}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
