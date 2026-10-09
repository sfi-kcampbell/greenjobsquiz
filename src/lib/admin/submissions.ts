/**
 * Submissions for Super Admins: list (filter, sort, page), detail, delete and
 * share-link revocation. Every value reaches SQL as a Drizzle parameter; sort
 * columns come from a fixed allow-list; LIKE terms are escaped.
 */
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Database, Executor } from "@/lib/db/create";
import { answers as answersTable, questions, quizCodes, quizSessions, quizzes, results, submissions } from "@/lib/db/schema";
import { hashToken, shareTokenFor } from "@/lib/public/tokens";
import { sanitizeRichText } from "@/lib/sanitize/rich-text";
import { toPercentage } from "@/lib/scoring/engine";

/* --------------------------------- Query --------------------------------- */

export const SORT_KEYS = ["date", "attempt", "quiz", "respondent", "match", "score", "answered", "time"] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export const PAGE_SIZES = [25, 50, 100] as const;

const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)))
  .optional()
  .catch(undefined);
const optionalId = z.coerce.number().int().positive().max(2_147_483_647).optional().catch(undefined);

/** The list's state, from the URL. Anything invalid falls back to a safe default. */
export const submissionListQuery = z.object({
  quiz: optionalId,
  response: optionalId,
  code: optionalId,
  from: isoDay,
  to: isoDay,
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .catch(undefined)
    .transform((v) => v || undefined),
  sort: z.enum(SORT_KEYS).catch("date"),
  dir: z.enum(["asc", "desc"]).catch("desc"),
  page: z.coerce.number().int().min(1).max(100_000).catch(1),
  per: z.coerce
    .number()
    .refine((n): n is (typeof PAGE_SIZES)[number] => (PAGE_SIZES as readonly number[]).includes(n))
    .catch(25),
});
export type SubmissionListQuery = z.infer<typeof submissionListQuery>;

/** Next.js searchParams (string | string[] | undefined) → query. */
export function parseListQuery(params: Record<string, string | string[] | undefined>): SubmissionListQuery {
  const flat = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  return submissionListQuery.parse(flat);
}

/** Escape LIKE wildcards so "100%" means the text "100%". Postgres's default escape is a backslash. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const SORT_COLUMNS = {
  date: submissions.createdAt,
  attempt: submissions.attemptNo,
  quiz: quizzes.title,
  respondent: submissions.email,
  match: submissions.resultTitle,
  score: submissions.rawSimilarity,
  answered: submissions.questionsAnswered,
  time: submissions.durationSeconds,
} satisfies Record<SortKey, unknown>;

/** ORDER BY for a list query: blanks last either way; id breaks ties so pages never shuffle. Needs `quizzes` joined. */
export function orderFor(query: SubmissionListQuery): SQL[] {
  const column = SORT_COLUMNS[query.sort];
  const direction = query.dir === "asc" ? sql`asc` : sql`desc`;
  return [sql`${column} ${direction} nulls last`, query.dir === "asc" ? asc(submissions.id) : desc(submissions.id)];
}

/* --------------------------------- List ---------------------------------- */

export type SubmissionRow = {
  id: number;
  attemptNo: number;
  createdAt: Date;
  quizId: number;
  quizTitle: string;
  email: string | null;
  resultTitle: string | null;
  percent: number | null;
  topCategory: string | null;
  questionsAnswered: number;
  questionTotal: number;
  durationSeconds: number | null;
  suspect: boolean;
  code: string | null;
};

/** The WHERE clause for a list query (shared with the CSV export). */
export async function filters(db: Executor, query: SubmissionListQuery): Promise<SQL | undefined> {
  const conditions: (SQL | undefined)[] = [];
  if (query.quiz) {
    conditions.push(eq(submissions.quizId, query.quiz));
    if (query.response) {
      // Only a response from the chosen quiz narrows the list; anything else is ignored.
      const [owned] = await db
        .select({ id: results.id })
        .from(results)
        .where(and(eq(results.id, query.response), eq(results.quizId, query.quiz)))
        .limit(1);
      if (owned) conditions.push(eq(submissions.resultId, query.response));
    }
    if (query.code) {
      // Likewise, only a code from the chosen quiz.
      const [owned] = await db
        .select({ id: quizCodes.id })
        .from(quizCodes)
        .where(and(eq(quizCodes.id, query.code), eq(quizCodes.quizId, query.quiz)))
        .limit(1);
      if (owned) conditions.push(eq(submissions.codeId, query.code));
    }
  }
  if (query.from) conditions.push(gte(submissions.createdAt, new Date(`${query.from}T00:00:00Z`)));
  if (query.to) {
    const end = new Date(`${query.to}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1); // the whole "to" day
    conditions.push(lt(submissions.createdAt, end));
  }
  if (query.q) {
    const term = `%${escapeLike(query.q)}%`;
    conditions.push(or(ilike(submissions.email, term), ilike(submissions.resultTitle, term)));
  }
  return and(...conditions);
}

export async function listSubmissions(db: Executor, query: SubmissionListQuery) {
  const where = await filters(db, query);
  const [{ total }] = await db.select({ total: count() }).from(submissions).where(where);
  const pages = Math.max(1, Math.ceil(total / query.per));
  const page = Math.min(query.page, pages);

  const questionTotals = db
    .select({ quizId: questions.quizId, n: count().as("n") })
    .from(questions)
    .where(isNull(questions.archivedAt))
    .groupBy(questions.quizId)
    .as("question_totals");

  const rows = await db
    .select({
      id: submissions.id,
      attemptNo: submissions.attemptNo,
      createdAt: submissions.createdAt,
      quizId: submissions.quizId,
      quizTitle: quizzes.title,
      email: submissions.email,
      resultTitle: submissions.resultTitle,
      rawSimilarity: submissions.rawSimilarity,
      topCategory: sql<string | null>`${submissions.scores} -> 'categories' -> (${submissions.topCategoryId}::text) ->> 'label'`,
      questionsAnswered: submissions.questionsAnswered,
      questionTotal: sql<number>`coalesce(${questionTotals.n}, 0)::int`,
      durationSeconds: submissions.durationSeconds,
      suspect: submissions.suspect,
      code: quizCodes.code,
    })
    .from(submissions)
    .innerJoin(quizzes, eq(quizzes.id, submissions.quizId))
    .leftJoin(questionTotals, eq(questionTotals.quizId, submissions.quizId))
    .leftJoin(quizCodes, eq(quizCodes.id, submissions.codeId))
    .where(where)
    .orderBy(...orderFor(query))
    .limit(query.per)
    .offset((page - 1) * query.per);

  return {
    rows: rows.map(({ rawSimilarity, ...r }): SubmissionRow => ({
      ...r,
      percent: rawSimilarity === null ? null : toPercentage(rawSimilarity),
    })),
    total,
    page,
    pages,
    per: query.per,
  };
}

/** Options for the quiz and response filters. */
export async function listFilterOptions(db: Executor, quizId?: number) {
  const quizOptions = await db.select({ id: quizzes.id, title: quizzes.title }).from(quizzes).orderBy(asc(quizzes.title));
  const responseOptions = quizId
    ? await db
        .select({ id: results.id, title: results.title })
        .from(results)
        .where(eq(results.quizId, quizId))
        .orderBy(asc(results.position), asc(results.id))
    : [];
  const codeOptions = quizId
    ? (await db.select({ id: quizCodes.id, code: quizCodes.code, label: quizCodes.label }).from(quizCodes).where(eq(quizCodes.quizId, quizId)).orderBy(asc(quizCodes.code))).map(
        (c) => ({ id: c.id, title: c.label ? `${c.code} (${c.label})` : c.code }),
      )
    : [];
  return { quizOptions, responseOptions, codeOptions };
}

/* -------------------------------- Detail --------------------------------- */

type StoredCategory = { raw: number; normalized: number | null; max: number; label: string; color: string };
type StoredScores = { status: string; isClose: boolean; isFallback: boolean; categories: Record<string, StoredCategory> };
type StoredRanked = { resultId: number; raw: number; title: string }[];
type StoredAnswer = {
  questionId: number;
  questionTitle: string;
  answers: { answerId: number; label: string; weights: Record<string, number> }[];
  contribution: Record<string, number>;
};

export async function getSubmissionDetail(db: Executor, id: number) {
  const [row] = await db
    .select({ submission: submissions, quizTitle: quizzes.title, quizSlug: quizzes.slug })
    .from(submissions)
    .innerJoin(quizzes, eq(quizzes.id, submissions.quizId))
    .where(eq(submissions.id, id))
    .limit(1);
  if (!row) return null;
  const s = row.submission;
  const scores = s.scores as StoredScores;
  const ranked = s.ranked as StoredRanked;
  const transcript = s.answers as StoredAnswer[];

  const top = ranked[0];
  const topPercent = top ? toPercentage(top.raw) : null;
  const ranking = ranked.map((r, i) => {
    const percent = toPercentage(r.raw);
    return {
      ...r,
      position: i + 1,
      percent,
      gapPoints: i === 0 || topPercent === null ? 0 : topPercent - percent,
      gapRaw: i === 0 || !top ? 0 : top.raw - r.raw,
    };
  });

  const categories = Object.entries(scores.categories).map(([categoryId, c]) => ({
    categoryId: Number(categoryId),
    ...c,
    percentOfMax: c.max > 0 ? Math.round(100 * Math.max(0, Math.min(1, c.raw / c.max))) : 0,
  }));
  const labels = Object.fromEntries(categories.map((c) => [c.categoryId, c.label]));

  // Current content, clearly separate from the stored snapshot (it may have changed since).
  const answerIds = transcript.flatMap((q) => q.answers.map((a) => a.answerId));
  const current = answerIds.length
    ? await db.select({ id: answersTable.id, bodyHtml: answersTable.bodyHtml }).from(answersTable).where(inArray(answersTable.id, answerIds))
    : [];
  const currentBody = new Map(current.map((a) => [a.id, sanitizeRichText(a.bodyHtml)]));

  // The link is derivable from the stored hashes; only offer it while it still matches.
  let shareToken: string | null = null;
  if (s.shareTokenHash) {
    const candidate = shareTokenFor(s.tokenHash, s.id);
    if (hashToken(candidate) === s.shareTokenHash) shareToken = candidate;
  }

  return {
    id: s.id,
    quiz: { id: s.quizId, title: row.quizTitle, slug: row.quizSlug },
    attemptNo: s.attemptNo,
    createdAt: s.createdAt,
    durationSeconds: s.durationSeconds,
    email: s.email,
    referrer: s.referrer,
    ipHashShort: s.ipHash ? s.ipHash.slice(0, 12) : null,
    engineVersion: s.engineVersion,
    suspect: s.suspect,
    status: scores.status,
    isClose: scores.isClose,
    isFallback: scores.isFallback,
    match: s.resultTitle ? { title: s.resultTitle, percent: s.rawSimilarity === null ? null : toPercentage(s.rawSimilarity) } : null,
    ranking,
    categories,
    transcript: transcript.map((q) => ({
      questionId: q.questionId,
      questionTitle: q.questionTitle,
      contribution: Object.entries(q.contribution)
        .filter(([, v]) => v !== 0)
        .map(([categoryId, value]) => ({ label: labels[Number(categoryId)] ?? `#${categoryId}`, value })),
      answers: q.answers.map((a) => ({
        answerId: a.answerId,
        label: a.label,
        weights: Object.entries(a.weights)
          .filter(([, v]) => v !== 0)
          .map(([categoryId, value]) => ({ label: labels[Number(categoryId)] ?? `#${categoryId}`, value })),
        currentBodyHtml: currentBody.get(a.answerId) ?? null,
        stillExists: currentBody.has(a.answerId),
      })),
    })),
    shareToken,
    shareRevoked: !s.shareTokenHash,
  };
}
export type SubmissionDetail = NonNullable<Awaited<ReturnType<typeof getSubmissionDetail>>>;

/* -------------------------------- Writes --------------------------------- */

/**
 * Deletes submissions (their submission_answers cascade). Their quiz sessions
 * are marked abandoned so the respondent's next visit starts a fresh attempt
 * instead of finding a "completed" attempt with no result.
 */
export async function deleteSubmissions(db: Database, ids: number[]): Promise<number> {
  if (ids.length === 0) return 0;
  return db.transaction(async (tx) => {
    await tx
      .update(quizSessions)
      .set({ status: "abandoned", submissionId: null })
      .where(inArray(quizSessions.submissionId, ids));
    const deleted = await tx.delete(submissions).where(inArray(submissions.id, ids)).returning({ id: submissions.id });
    return deleted.length;
  });
}

/** Turns off a submission's share link for good. */
export async function revokeShareLink(db: Executor, id: number): Promise<void> {
  await db.update(submissions).set({ shareTokenHash: null }).where(eq(submissions.id, id));
}
