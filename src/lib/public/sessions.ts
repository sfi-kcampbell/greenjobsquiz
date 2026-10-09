/**
 * Anonymous respondent sessions: progress, restart, submit, results.
 * See SPEC.md → "Sessions and progress". Every function takes the database
 * so it can be tested against Postgres directly.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { CODE_MESSAGES, resolveCode } from "@/lib/content/quiz-codes";
import { loadScoringBundle } from "@/lib/content/scoring-model";
import type { Database, Executor, Tx } from "@/lib/db/create";
import { quizSessions, quizzes, results, submissionAnswers, submissions } from "@/lib/db/schema";
import { sanitizeRichText } from "@/lib/sanitize/rich-text";
import { score, toPercentage, type Selection } from "@/lib/scoring/engine";
import { PublicError } from "./errors";
import type { PublicQuiz } from "./structure";
import { hashToken, newToken, shareTokenFor } from "./tokens";

const SESSION_DAYS = 180;
const RESTART_IDEMPOTENCY_MS = 5_000;
const SUSPECT_SECONDS = 3;
const MAX_ANSWER_IDS = 50;

type Answers = Record<string, number[]>;
type SessionRow = typeof quizSessions.$inferSelect;

export type SessionView = {
  status: "none" | "in_progress" | "completed";
  attemptNo: number | null;
  revision: number;
  answers: Answers;
  currentIndex: number;
  answeredCount: number;
  total: number;
  /** Present when the latest attempt has been submitted. */
  result: { shareToken: string; resultTitle: string | null; percent: number | null } | null;
};

/* -------------------------------- Helpers -------------------------------- */

const expiry = () => new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
const answeredCount = (answers: Answers) => Object.values(answers).filter((ids) => ids.length > 0).length;

async function latestSession(db: Executor, quizId: number, tokenHash: string): Promise<SessionRow | null> {
  const [row] = await db
    .select()
    .from(quizSessions)
    .where(and(eq(quizSessions.quizId, quizId), eq(quizSessions.tokenHash, tokenHash)))
    .orderBy(desc(quizSessions.attemptNo))
    .limit(1);
  return row ?? null;
}

async function submissionFor(db: Executor, submissionId: number | null) {
  if (submissionId === null) return null;
  const [row] = await db.select().from(submissions).where(eq(submissions.id, submissionId)).limit(1);
  return row ?? null;
}

function viewOf(quiz: PublicQuiz, row: SessionRow | null, submission: Awaited<ReturnType<typeof submissionFor>>): SessionView {
  if (!row || row.status === "abandoned") {
    return { status: "none", attemptNo: null, revision: 0, answers: {}, currentIndex: 0, answeredCount: 0, total: quiz.questions.length, result: null };
  }
  return {
    status: row.status,
    attemptNo: row.attemptNo,
    revision: row.revision,
    answers: row.answers,
    currentIndex: row.currentIndex,
    answeredCount: answeredCount(row.answers),
    total: quiz.questions.length,
    result:
      row.status === "completed" && submission
        ? {
            shareToken: shareTokenFor(row.tokenHash, submission.id),
            resultTitle: submission.resultTitle,
            percent: submission.rawSimilarity === null ? null : toPercentage(submission.rawSimilarity),
          }
        : null,
  };
}

/** Checks one answer against the published structure. Throws 422 if it doesn't fit. */
export function validateAnswer(quiz: PublicQuiz, questionId: number, answerIds: number[]): void {
  const question = quiz.questions.find((q) => q.id === questionId);
  if (!question) {
    throw new PublicError(422, "quiz_invalid_answer", "That question isn't part of this quiz.", { questionId });
  }
  if (answerIds.length === 0) return; // skipped / cleared
  const unique = new Set(answerIds);
  if (unique.size !== answerIds.length || answerIds.length > MAX_ANSWER_IDS) {
    throw new PublicError(422, "quiz_invalid_answer", "Duplicate or too many answers.", { questionId });
  }
  for (const id of answerIds) {
    if (!question.answers.some((a) => a.id === id)) {
      throw new PublicError(422, "quiz_invalid_answer", "That answer isn't part of this question.", { questionId, answerId: id });
    }
  }
  const max = question.type === "single" ? 1 : question.maxSelect;
  const min = question.type === "single" ? 1 : question.minSelect;
  if (answerIds.length > max || answerIds.length < min) {
    throw new PublicError(422, "quiz_invalid_answer", `Choose between ${min} and ${max} answers.`, { questionId, min, max });
  }
}

/* ---------------------------------- Read ---------------------------------- */

export async function getSessionView(db: Executor, quiz: PublicQuiz, tokenHash: string | null): Promise<SessionView> {
  if (!tokenHash) return viewOf(quiz, null, null);
  const row = await latestSession(db, quiz.id, tokenHash);
  return viewOf(quiz, row, await submissionFor(db, row?.submissionId ?? null));
}

/* --------------------------------- Writes -------------------------------- */

export type SaveResult = {
  /** Set when this request created the respondent's token (send it back once). */
  newToken: string | null;
  tokenHash: string;
  revision: number;
  stale: boolean;
  view: SessionView;
};

/**
 * Saves one or more answers. Creates the token and session on the first
 * write (never on reads). A stale clientRevision still applies the write
 * (per-question last-write-wins) and returns the full answer set.
 */
export async function saveAnswers(
  db: Database,
  quiz: PublicQuiz,
  input: {
    tokenHash: string | null;
    entries: { questionId: number; answerIds: number[] }[];
    clientRevision?: number;
    currentIndex?: number;
    ipHash?: string | null;
    /** A quiz code; only used when this save starts a new attempt. */
    code?: string | null;
  },
): Promise<SaveResult> {
  for (const e of input.entries) validateAnswer(quiz, e.questionId, e.answerIds);

  let token: string | null = null;
  let tokenHash = input.tokenHash;
  if (!tokenHash) {
    token = newToken();
    tokenHash = hashToken(token);
  }

  let row = await latestSession(db, quiz.id, tokenHash);
  if (row?.status === "completed") {
    throw new PublicError(409, "quiz_already_submitted", "This attempt was already submitted. Start over to answer again.");
  }
  // A client with no session yet holds revision 0; a write that creates the attempt isn't stale.
  let created = false;
  if (!row || row.status === "abandoned") {
    const codeId = await codeForNewAttempt(db, quiz, input.code);
    row = await createAttempt(db, quiz.id, tokenHash, (row?.attemptNo ?? 0) + 1, input.ipHash ?? null, codeId);
    created = true;
  }

  const patch: Answers = {};
  const remove: string[] = [];
  for (const e of input.entries) {
    if (e.answerIds.length) patch[String(e.questionId)] = e.answerIds;
    else remove.push(String(e.questionId));
  }

  const [updated] = await db
    .update(quizSessions)
    .set({
      // Keys are numeric question ids, so a Postgres array literal is safe here.
      answers: sql`(${quizSessions.answers} - ${`{${remove.join(",")}}`}::text[]) || ${JSON.stringify(patch)}::jsonb`,
      revision: sql`${quizSessions.revision} + 1`,
      currentIndex: input.currentIndex ?? sql`${quizSessions.currentIndex}`,
      expiresAt: expiry(),
    })
    .where(and(eq(quizSessions.id, row.id), eq(quizSessions.status, "in_progress")))
    .returning();
  if (!updated) {
    throw new PublicError(409, "quiz_already_submitted", "This attempt was just submitted. Start over to answer again.");
  }

  const previous = created ? 0 : updated.revision - 1;
  return {
    newToken: token,
    tokenHash,
    revision: updated.revision,
    stale: input.clientRevision !== undefined && input.clientRevision !== previous,
    view: viewOf(quiz, updated, null),
  };
}

/**
 * The quiz code for a new attempt: null when none is given (allowed unless
 * the quiz requires one); refused if the code is unknown, closed or not open yet.
 */
async function codeForNewAttempt(db: Executor, quiz: PublicQuiz, code: string | null | undefined): Promise<number | null> {
  if (!code) {
    if (quiz.settings.requireCode) {
      throw new PublicError(403, "quiz_code_required", "This quiz needs a quiz code to start.");
    }
    return null;
  }
  const resolved = await resolveCode(db, quiz.id, code);
  if (!resolved.ok) {
    throw new PublicError(422, "quiz_code_invalid", CODE_MESSAGES[resolved.reason], {
      reason: resolved.reason,
      ...(resolved.opensAt ? { opensAt: resolved.opensAt.toISOString() } : {}),
    });
  }
  return resolved.codeId;
}

/** Inserts attempt `attemptNo`; if a concurrent request already did, returns that row. */
async function createAttempt(
  db: Executor,
  quizId: number,
  tokenHash: string,
  attemptNo: number,
  ipHash: string | null,
  codeId: number | null = null,
): Promise<SessionRow> {
  const [row] = await db
    .insert(quizSessions)
    .values({ quizId, tokenHash, attemptNo, ipHash, codeId, expiresAt: expiry() })
    .onConflictDoNothing()
    .returning();
  if (row) return row;
  const existing = await latestSession(db, quizId, tokenHash);
  if (!existing) throw new Error("Session insert conflicted but no row exists.");
  return existing;
}

/**
 * Starts a new attempt; never wipes. The current in-progress attempt is
 * marked abandoned. A double-click within 5 s returns the same empty attempt.
 */
export async function restart(
  db: Database,
  quiz: PublicQuiz,
  tokenHash: string | null,
  ipHash?: string | null,
  code?: string | null,
): Promise<SessionView> {
  if (!tokenHash) return viewOf(quiz, null, null);
  const latest = await latestSession(db, quiz.id, tokenHash);
  if (!latest) return viewOf(quiz, null, null);

  if (
    latest.status === "in_progress" &&
    answeredCount(latest.answers) === 0 &&
    Date.now() - latest.startedAt.getTime() < RESTART_IDEMPOTENCY_MS
  ) {
    return viewOf(quiz, latest, null);
  }

  if (!quiz.settings.retakeAllowed) {
    const [done] = await db
      .select({ id: submissions.id })
      .from(submissions)
      .where(and(eq(submissions.quizId, quiz.id), eq(submissions.tokenHash, tokenHash)))
      .limit(1);
    if (done) throw new PublicError(403, "quiz_retake_not_allowed", "This quiz can only be taken once.");
  }

  // A retake keeps the code it started with unless a new one is given.
  const codeId = code ? await codeForNewAttempt(db, quiz, code) : (latest.codeId ?? (await codeForNewAttempt(db, quiz, null)));
  const row = await db.transaction(async (tx) => {
    if (latest.status === "in_progress") {
      await tx.update(quizSessions).set({ status: "abandoned" }).where(eq(quizSessions.id, latest.id));
    }
    return createAttempt(tx, quiz.id, tokenHash, latest.attemptNo + 1, ipHash ?? null, codeId);
  });
  return viewOf(quiz, row, null);
}

/* --------------------------------- Submit -------------------------------- */

export type SubmitResult = { shareToken: string; submissionId: number; alreadySubmitted: boolean };

/**
 * Scores the attempt on the server and stores an append-only submission
 * with snapshots (titles, weights, contributions) so history never changes
 * when content is edited later. Idempotent per session.
 */
export async function submit(
  db: Database,
  quiz: PublicQuiz,
  input: { tokenHash: string | null; email?: string | null; ipHash?: string | null; referrer?: string | null },
): Promise<SubmitResult> {
  const tokenHash = input.tokenHash;
  if (!tokenHash) throw new PublicError(404, "quiz_session_not_found", "Answer at least one question first.");

  return db.transaction(async (tx) => {
    const [session] = await tx
      .select()
      .from(quizSessions)
      .where(and(eq(quizSessions.quizId, quiz.id), eq(quizSessions.tokenHash, tokenHash)))
      .orderBy(desc(quizSessions.attemptNo))
      .limit(1)
      .for("update");
    if (!session || session.status === "abandoned") {
      throw new PublicError(404, "quiz_session_not_found", "Answer at least one question first.");
    }

    if (session.status === "completed" && session.submissionId !== null) {
      return { shareToken: shareTokenFor(tokenHash, session.submissionId), submissionId: session.submissionId, alreadySubmitted: true };
    }

    const answers = session.answers;
    const missing = quiz.questions.filter((q) => q.required && !(answers[String(q.id)]?.length)).map((q) => q.id);
    if (missing.length) {
      throw new PublicError(422, "quiz_missing_answers", "Some required questions haven't been answered.", { questionIds: missing });
    }

    const stored = await storeSubmission(tx, quiz, session, input);
    await tx
      .update(quizSessions)
      .set({ status: "completed", submissionId: stored.submissionId })
      .where(eq(quizSessions.id, session.id));
    return { ...stored, alreadySubmitted: false };
  });
}

async function storeSubmission(
  tx: Tx,
  quiz: PublicQuiz,
  session: SessionRow,
  input: { email?: string | null; ipHash?: string | null; referrer?: string | null },
): Promise<{ shareToken: string; submissionId: number }> {
  const bundle = await loadScoringBundle(tx, quiz.id);
  const selections: Selection[] = Object.entries(session.answers)
    .filter(([, ids]) => ids.length > 0)
    .map(([questionId, answerIds]) => ({ questionId: Number(questionId), answerIds }));
  const result = score(bundle.model, selections);

  const resultTitles = new Map(bundle.display.results.map((r) => [r.id, r.title]));
  const scores = Object.fromEntries(
    bundle.display.categories.map((c) => [
      c.id,
      {
        raw: result.vector[c.id] ?? 0,
        normalized: result.normalized[c.id] ?? null,
        max: result.maxAchievable[c.id] ?? 0,
        label: c.name,
        color: c.color,
      },
    ]),
  );
  // Top category: the highest normalized score among scored categories.
  const top = Object.entries(result.normalized).reduce<[number, number] | null>(
    (best, [id, v]) => (v > 0 && (!best || v > best[1]) ? [Number(id), v] : best),
    null,
  );

  // Snapshot every answered question with titles and the weights used.
  const questionById = new Map(bundle.model.questions.map((q) => [q.id, q]));
  const displayById = new Map(bundle.display.questions.map((q) => [q.id, q]));
  const contributionByQuestion = new Map(result.contributions.map((c) => [c.questionId, c]));
  const answerSnapshot = result.contributions.map((c) => {
    const display = displayById.get(c.questionId)!;
    const model = questionById.get(c.questionId)!;
    return {
      questionId: c.questionId,
      questionTitle: display.title,
      answers: c.answerIds.map((id) => ({
        answerId: id,
        label: display.answers.find((a) => a.id === id)?.label ?? "",
        weights: model.answers.find((a) => a.id === id)?.weights ?? {},
      })),
      contribution: contributionByQuestion.get(c.questionId)?.vector ?? {},
    };
  });

  const match = result.match;
  const durationSeconds = Math.max(0, Math.round((Date.now() - session.startedAt.getTime()) / 1000));
  const [row] = await tx
    .insert(submissions)
    .values({
      quizId: quiz.id,
      sessionId: session.id,
      codeId: session.codeId,
      tokenHash: session.tokenHash,
      attemptNo: session.attemptNo,
      resultId: match?.resultId ?? null,
      resultTitle: match ? (resultTitles.get(match.resultId) ?? null) : null,
      rawSimilarity: match && !result.isFallback ? Math.round(match.raw * 1e6) / 1e6 : null,
      topCategoryId: top?.[0] ?? null,
      scores: { status: result.status, isClose: result.isClose, isFallback: result.isFallback, categories: scores },
      ranked: result.ranked.map((r) => ({ ...r, title: resultTitles.get(r.resultId) ?? "" })),
      answers: answerSnapshot,
      email: input.email || null,
      questionsAnswered: selections.length,
      durationSeconds,
      engineVersion: result.engine,
      suspect: durationSeconds < SUSPECT_SECONDS,
      ipHash: input.ipHash ?? null,
      referrer: input.referrer ? input.referrer.slice(0, 500) : null,
    })
    .returning({ id: submissions.id });

  const shareToken = shareTokenFor(session.tokenHash, row.id);
  await tx.update(submissions).set({ shareTokenHash: hashToken(shareToken) }).where(eq(submissions.id, row.id));

  const rows = answerSnapshot.flatMap((q) =>
    q.answers.map((a) => ({
      submissionId: row.id,
      quizId: quiz.id,
      questionId: q.questionId,
      answerId: a.answerId,
      questionTitle: q.questionTitle,
      answerTitle: a.label,
      position: bundle.model.questions.findIndex((x) => x.id === q.questionId),
    })),
  );
  if (rows.length) await tx.insert(submissionAnswers).values(rows);

  return { shareToken, submissionId: row.id };
}

/* -------------------------------- Results -------------------------------- */

export type ResultPayload = {
  quiz: { id: number; title: string; slug: string; deliveryMode: "hosted" | "headless" };
  createdAt: string;
  attemptNo: number;
  status: "scored" | "insufficient_data" | "no_results";
  isClose: boolean;
  isFallback: boolean;
  match: {
    resultId: number | null;
    title: string;
    bodyHtml: string | null;
    excerpt: string | null;
    ctaUrl: string | null;
    ctaLabel: string | null;
    percent: number | null;
    raw: number | null;
  } | null;
  runnersUp: { resultId: number; title: string; excerpt: string | null; percent: number; raw: number }[];
  /** Per category; `percent` is the score as a share of the most achievable (0–100). */
  scores: Record<string, { raw: number; normalized: number | null; percent: number; label: string; color: string }>;
};

type StoredScores = {
  status: ResultPayload["status"];
  isClose: boolean;
  isFallback: boolean;
  categories: Record<string, { raw: number; normalized: number | null; max: number; label: string; color: string }>;
};
type StoredRanked = { resultId: number; raw: number; title: string }[];

export const shareOfMax = (raw: number, max: number) =>
  max > 0 ? Math.round(100 * Math.max(0, Math.min(1, raw / max))) : 0;

/** The token is the credential; unknown or revoked tokens look the same. */
export async function getResultByShareToken(db: Executor, shareToken: string): Promise<ResultPayload | null> {
  const [row] = await db
    .select({ submission: submissions, quiz: { id: quizzes.id, title: quizzes.title, slug: quizzes.slug, deliveryMode: quizzes.deliveryMode, runnersUpCount: quizzes.runnersUpCount } })
    .from(submissions)
    .innerJoin(quizzes, eq(quizzes.id, submissions.quizId))
    .where(eq(submissions.shareTokenHash, hashToken(shareToken)))
    .limit(1);
  if (!row) return null;
  const { submission, quiz } = row;
  const scores = submission.scores as StoredScores;
  const ranked = submission.ranked as StoredRanked;

  // Current content for the responses involved (titles fall back to the snapshot).
  const ids = [...new Set([submission.resultId, ...ranked.map((r) => r.resultId)].filter((id): id is number => id !== null))];
  const current = ids.length ? await db.select().from(results).where(inArray(results.id, ids)) : [];
  const content = new Map(current.map((r) => [r.id, r]));

  let match: ResultPayload["match"] = null;
  if (submission.resultId !== null || submission.resultTitle) {
    const c = submission.resultId !== null ? content.get(submission.resultId) : undefined;
    match = {
      resultId: submission.resultId,
      title: c?.title ?? submission.resultTitle ?? "",
      bodyHtml: sanitizeRichText(c?.bodyHtml, { external: true }),
      excerpt: c?.excerpt ?? null,
      ctaUrl: c?.ctaUrl ?? null,
      ctaLabel: c?.ctaLabel ?? null,
      percent: submission.rawSimilarity === null ? null : toPercentage(submission.rawSimilarity),
      raw: submission.rawSimilarity,
    };
  }

  const runnersUp = scores.isFallback
    ? []
    : ranked.slice(1, 1 + quiz.runnersUpCount).map((r) => {
        const c = content.get(r.resultId);
        return { resultId: r.resultId, title: c?.title ?? r.title, excerpt: c?.excerpt ?? null, percent: toPercentage(r.raw), raw: r.raw };
      });

  return {
    quiz: { id: quiz.id, title: quiz.title, slug: quiz.slug, deliveryMode: quiz.deliveryMode },
    createdAt: submission.createdAt.toISOString(),
    attemptNo: submission.attemptNo,
    status: scores.status,
    isClose: scores.isClose,
    isFallback: scores.isFallback,
    match,
    runnersUp,
    scores: Object.fromEntries(
      Object.entries(scores.categories).map(([id, s]) => [
        id,
        { raw: s.raw, normalized: s.normalized, percent: shareOfMax(s.raw, s.max), label: s.label, color: s.color },
      ]),
    ),
  };
}

export async function listAttempts(db: Executor, quizId: number, tokenHash: string | null) {
  if (!tokenHash) return [];
  const rows = await db
    .select()
    .from(submissions)
    .where(and(eq(submissions.quizId, quizId), eq(submissions.tokenHash, tokenHash)))
    .orderBy(asc(submissions.attemptNo));
  return rows.map((s) => ({
    attemptNo: s.attemptNo,
    createdAt: s.createdAt.toISOString(),
    resultTitle: s.resultTitle,
    percent: s.rawSimilarity === null ? null : toPercentage(s.rawSimilarity),
    shareToken: s.shareTokenHash ? shareTokenFor(tokenHash, s.id) : null,
  }));
}
