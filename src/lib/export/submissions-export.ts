/**
 * Submissions → CSV rows, in batches (memory stays at one batch). Uses the
 * Submissions list's filters and order, so a file always matches the list.
 *
 * - Wide: one row per attempt, plus raw and normalized columns per category
 *   (needs a quiz filter, so the columns mean one thing).
 * - Long: one row per submission × answered question, from the stored
 *   transcript; answer details are today's text, stripped of HTML.
 */
import { asc, eq, inArray, sql } from "drizzle-orm";
import { filters, orderFor, type SubmissionListQuery } from "@/lib/admin/submissions";
import type { Executor } from "@/lib/db/create";
import { answers as answersTable, categories, quizCodes, quizzes, submissions } from "@/lib/db/schema";
import { toPercentage } from "@/lib/scoring/engine";
import { MAX_CELL_TEXT, stripHtml, type Cell } from "./csv";

export const BATCH_SIZE = 500;

type ExportRow = typeof submissions.$inferSelect & { quizTitle: string; code: string | null };
type StoredCategory = { raw: number; normalized: number | null; label: string };
type StoredScores = { categories: Record<string, StoredCategory> };
type StoredAnswer = {
  questionId: number;
  questionTitle: string;
  answers: { answerId: number; label: string }[];
  contribution: Record<string, number>;
};

/** Matching submissions, one batch at a time (limit/offset as parameters). */
export async function* exportBatches(db: Executor, query: SubmissionListQuery, batchSize = BATCH_SIZE): AsyncGenerator<ExportRow[]> {
  const where = await filters(db, query);
  for (let offset = 0; ; offset += batchSize) {
    const rows = await db
      .select({ s: submissions, quizTitle: quizzes.title, code: quizCodes.code })
      .from(submissions)
      .innerJoin(quizzes, eq(quizzes.id, submissions.quizId))
      .leftJoin(quizCodes, eq(quizCodes.id, submissions.codeId))
      .where(where)
      .orderBy(...orderFor(query))
      .limit(batchSize)
      .offset(offset);
    if (rows.length === 0) return;
    yield rows.map((r) => ({ ...r.s, quizTitle: r.quizTitle, code: r.code }));
    if (rows.length < batchSize) return;
  }
}

const iso = (d: Date) => d.toISOString();
const round = (n: number | null | undefined, places = 4) => (n === null || n === undefined ? null : Math.round(n * 10 ** places) / 10 ** places);

/* ---------------------------------- Wide --------------------------------- */

export type WideCategory = { id: number; label: string };

/**
 * The categories in the matching submissions' snapshots, in today's order
 * (categories deleted since come last), labelled as they were stored.
 */
export async function wideCategories(db: Executor, query: SubmissionListQuery): Promise<WideCategory[]> {
  if (!query.quiz) throw new Error("Wide export needs a quiz filter.");
  const where = await filters(db, query);
  const stored = await db
    .select({
      id: sql<string>`k.key`,
      label: sql<string>`max(k.value ->> 'label')`,
    })
    .from(submissions)
    .innerJoin(sql`lateral jsonb_each(${submissions.scores} -> 'categories') as k`, sql`true`)
    .where(where)
    .groupBy(sql`k.key`);
  const current = await db
    .select({ id: categories.id, position: categories.position })
    .from(categories)
    .where(eq(categories.quizId, query.quiz))
    .orderBy(asc(categories.position), asc(categories.id));
  const order = new Map(current.map((c, i) => [c.id, i]));
  return stored
    .map((c) => ({ id: Number(c.id), label: c.label }))
    .sort((a, b) => (order.get(a.id) ?? 1e9 + a.id) - (order.get(b.id) ?? 1e9 + b.id));
}

const BASE_HEADERS = ["Submission ID", "Attempt", "Date (UTC)", "Quiz", "Email", "Matched response", "Quiz code"];

export function wideHeader(cats: WideCategory[]): string[] {
  return [
    ...BASE_HEADERS,
    "Score %",
    "Raw similarity",
    "Top category",
    "Questions answered",
    "Duration (s)",
    "Suspect",
    "Engine version",
    ...cats.flatMap((c) => [`${c.label} raw`, `${c.label} normalized`]),
  ];
}

export function wideRow(s: ExportRow, cats: WideCategory[]): Cell[] {
  const scores = (s.scores as StoredScores).categories;
  return [
    s.id,
    s.attemptNo,
    iso(s.createdAt),
    s.quizTitle,
    s.email,
    s.resultTitle,
    s.code,
    s.rawSimilarity === null ? null : toPercentage(s.rawSimilarity),
    s.rawSimilarity,
    s.topCategoryId === null ? null : (scores[String(s.topCategoryId)]?.label ?? null),
    s.questionsAnswered,
    s.durationSeconds,
    s.suspect,
    s.engineVersion,
    ...cats.flatMap((c) => {
      const v = scores[String(c.id)];
      return [round(v?.raw), round(v?.normalized)];
    }),
  ];
}

/* ---------------------------------- Long --------------------------------- */

export const LONG_HEADER = [
  ...BASE_HEADERS,
  "Question #",
  "Question",
  "Answer(s)",
  "Answer details (current)",
  "Contribution",
];

/** Today's answer text for a batch, plain and truncated (one query per batch). */
export async function answerDetails(db: Executor, batch: ExportRow[]): Promise<Map<number, string>> {
  const ids = [...new Set(batch.flatMap((s) => (s.answers as StoredAnswer[]).flatMap((q) => q.answers.map((a) => a.answerId))))];
  if (!ids.length) return new Map();
  const rows = await db.select({ id: answersTable.id, bodyHtml: answersTable.bodyHtml }).from(answersTable).where(inArray(answersTable.id, ids));
  return new Map(rows.map((r) => [r.id, stripHtml(r.bodyHtml)]));
}

export function longRows(s: ExportRow, details: Map<number, string>): Cell[][] {
  const labels = (s.scores as StoredScores).categories;
  return (s.answers as StoredAnswer[]).map((q, i) => [
    s.id,
    s.attemptNo,
    iso(s.createdAt),
    s.quizTitle,
    s.email,
    s.resultTitle,
    s.code,
    i + 1,
    q.questionTitle,
    q.answers.map((a) => a.label).join("; "),
    // Several answers' details can add up past a spreadsheet cell's limit.
    q.answers
      .map((a) => details.get(a.answerId) ?? "")
      .filter(Boolean)
      .join(" | ")
      .slice(0, MAX_CELL_TEXT),
    Object.entries(q.contribution)
      .filter(([, v]) => v !== 0)
      .map(([id, v]) => `${labels[id]?.label ?? `#${id}`} ${v > 0 ? "+" : ""}${round(v, 2)}`)
      .join("; "),
  ]);
}
