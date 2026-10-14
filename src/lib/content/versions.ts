/**
 * Drafts and published versions.
 *
 * Admins edit the working copy (the content tables). Publishing freezes it
 * into a numbered version (`quiz_versions.content`); the public site only
 * ever serves versions, and an attempt finishes on the version it started.
 *
 * Versioned: title, intro, categories, questions, answers, responses,
 * weights and scoring settings. Live (straight from the quiz row): slug,
 * banner, CSS, delivery, respondent options and quiz codes.
 */
import { and, count, desc, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import type { Database, Executor } from "@/lib/db/create";
import {
  answers,
  answerWeights,
  categories,
  questions,
  quizVersions,
  quizzes,
  results,
  resultWeights,
  submissionAnswers,
  submissions,
} from "@/lib/db/schema";
import type { ScoringModel } from "@/lib/scoring/engine";
import { listCategories } from "./categories";
import { ContentError } from "./errors";
import { listQuestions } from "./questions";
import { getQuiz, lockQuiz } from "./quizzes";
import { listResponses } from "./responses";
import type { ScoringBundle } from "./scoring-model";

/* --------------------------------- Content -------------------------------- */

type Weights = Record<string, number>;

export type QuizContent = {
  title: string;
  introHtml: string;
  scoring: { normalizePerCategory: boolean; runnersUpCount: number; defaultResultId: number | null };
  categories: { id: number; name: string; abbr: string; color: string; importance: number; position: number }[];
  questions: {
    id: number;
    title: string;
    helpHtml: string | null;
    type: "single" | "multi";
    minSelect: number;
    maxSelect: number;
    required: boolean;
    splitMulti: boolean;
    position: number;
    answers: { id: number; label: string; bodyHtml: string | null; position: number; weights: Weights }[];
  }[];
  responses: {
    id: number;
    title: string;
    excerpt: string | null;
    bodyHtml: string;
    ctaUrl: string | null;
    ctaLabel: string | null;
    position: number;
    weights: Weights;
  }[];
};

const strKeys = (w: Record<number | string, number>): Weights => Object.fromEntries(Object.entries(w).map(([k, v]) => [String(k), v]));

/** The working copy (what admins are editing). Sequential: `db` may be a transaction. */
export async function readWorkingContent(db: Executor, quizId: number): Promise<QuizContent> {
  const quiz = await getQuiz(db, quizId);
  if (!quiz) throw new ContentError("not_found", "That quiz no longer exists.");
  const cats = await listCategories(db, quizId);
  const qs = await listQuestions(db, quizId);
  const rs = await listResponses(db, quizId);
  return {
    title: quiz.title,
    introHtml: quiz.introHtml,
    scoring: { normalizePerCategory: quiz.normalizePerCategory, runnersUpCount: quiz.runnersUpCount, defaultResultId: quiz.defaultResultId },
    categories: cats.map(({ id, name, abbr, color, importance, position }) => ({ id, name, abbr, color, importance, position })),
    questions: qs.map((q) => ({
      id: q.id,
      title: q.title,
      helpHtml: q.helpHtml,
      type: q.type,
      minSelect: q.minSelect,
      maxSelect: q.maxSelect,
      required: q.required,
      splitMulti: q.splitMulti,
      position: q.position,
      answers: q.answers.map((a) => ({ id: a.id, label: a.label, bodyHtml: a.bodyHtml, position: a.position, weights: strKeys(a.weights) })),
    })),
    responses: rs.map((r) => ({
      id: r.id,
      title: r.title,
      excerpt: r.excerpt,
      bodyHtml: r.bodyHtml,
      ctaUrl: r.ctaUrl,
      ctaLabel: r.ctaLabel,
      position: r.position,
      weights: strKeys(r.weights),
    })),
  };
}

const numKeys = (w: Weights): Record<number, number> => Object.fromEntries(Object.entries(w).map(([k, v]) => [Number(k), v]));

/** Everything the scoring engine and health checks need, from either source. */
export function bundleFromContent(content: QuizContent): ScoringBundle {
  const settings = {
    runnersUpCount: content.scoring.runnersUpCount,
    normalizePerCategory: content.scoring.normalizePerCategory,
    defaultResultId: content.scoring.defaultResultId,
  };
  const model: ScoringModel = {
    categories: content.categories.map((c) => ({ id: c.id, importance: c.importance })),
    questions: content.questions.map((q) => ({
      id: q.id,
      type: q.type,
      splitMulti: q.splitMulti,
      maxSelect: q.maxSelect,
      answers: q.answers.map((a) => ({ id: a.id, weights: numKeys(a.weights) })),
    })),
    results: content.responses.map((r) => ({ id: r.id, position: r.position, weights: numKeys(r.weights) })),
    options: { normalizePerCategory: settings.normalizePerCategory, defaultResultId: settings.defaultResultId },
  };
  const names = {
    categories: Object.fromEntries(content.categories.map((c) => [c.id, c.name])),
    questions: Object.fromEntries(content.questions.map((q, i) => [q.id, `${i + 1}. ${q.title}`])),
    answers: Object.fromEntries(content.questions.flatMap((q) => q.answers.map((a) => [a.id, a.label]))),
    results: Object.fromEntries(content.responses.map((r) => [r.id, r.title])),
  };
  return {
    model,
    health: { ...model, runnersUpCount: settings.runnersUpCount, names },
    display: {
      categories: content.categories.map(({ id, name, abbr, color }) => ({ id, name, abbr, color })),
      questions: content.questions.map((q) => ({
        id: q.id,
        title: q.title,
        type: q.type,
        maxSelect: q.maxSelect,
        answers: q.answers.map((a) => ({ id: a.id, label: a.label })),
      })),
      results: content.responses.map((r) => ({ id: r.id, title: r.title })),
    },
    settings,
  };
}

/** Stable JSON (sorted keys), so content read back from jsonb compares equal. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export const sameContent = (a: QuizContent, b: QuizContent) => canonical(a) === canonical(b);

/* ---------------------------------- Diff ---------------------------------- */

const weightsEqual = (a: Weights, b: Weights) => canonical(a) === canonical(b);
const quote = (t: string) => `“${t}”`;

/** What changed from `from` (published) to `to` (draft), in plain words. */
export function diffContent(from: QuizContent, to: QuizContent): string[] {
  const out: string[] = [];
  if (from.title !== to.title) out.push(`Changed the title to ${quote(to.title)}`);
  if (from.introHtml !== to.introHtml) out.push("Changed the introduction");
  if (canonical(from.scoring) !== canonical(to.scoring)) out.push("Changed scoring settings");

  const byId = <T extends { id: number }>(list: T[]) => new Map(list.map((x) => [x.id, x]));
  const fc = byId(from.categories);
  const tc = byId(to.categories);
  for (const c of to.categories) {
    const old = fc.get(c.id);
    if (!old) out.push(`Added category ${quote(c.name)}`);
    else if (canonical({ ...old, position: 0 }) !== canonical({ ...c, position: 0 })) out.push(`Edited category ${quote(c.name)}`);
  }
  for (const c of from.categories) if (!tc.has(c.id)) out.push(`Removed category ${quote(c.name)}`);
  if (from.categories.map((c) => c.id).filter((id) => tc.has(id)).join() !== to.categories.map((c) => c.id).filter((id) => fc.has(id)).join()) {
    out.push("Reordered categories");
  }

  const fq = byId(from.questions);
  const tq = byId(to.questions);
  let answerWeightChanges = 0;
  to.questions.forEach((q, i) => {
    const old = fq.get(q.id);
    const label = `question ${i + 1} ${quote(q.title)}`;
    if (!old) return void out.push(`Added ${label}`);
    const textChanged =
      old.title !== q.title ||
      old.helpHtml !== q.helpHtml ||
      old.type !== q.type ||
      old.minSelect !== q.minSelect ||
      old.maxSelect !== q.maxSelect ||
      old.required !== q.required ||
      old.splitMulti !== q.splitMulti;
    const oa = byId(old.answers);
    const ta = byId(q.answers);
    const answersChanged =
      q.answers.length !== old.answers.length ||
      q.answers.some((a, j) => {
        const o = oa.get(a.id);
        return !o || o.label !== a.label || o.bodyHtml !== a.bodyHtml || old.answers[j]?.id !== a.id;
      }) ||
      old.answers.some((a) => !ta.has(a.id));
    if (textChanged || answersChanged) out.push(`Edited ${label}`);
    answerWeightChanges += q.answers.filter((a) => oa.has(a.id) && !weightsEqual(oa.get(a.id)!.weights, a.weights)).length;
  });
  for (const q of from.questions) if (!tq.has(q.id)) out.push(`Removed question ${quote(q.title)}`);
  if (from.questions.map((q) => q.id).filter((id) => tq.has(id)).join() !== to.questions.map((q) => q.id).filter((id) => fq.has(id)).join()) {
    out.push("Reordered questions");
  }
  if (answerWeightChanges) out.push(`Changed weights on ${answerWeightChanges} answer${answerWeightChanges === 1 ? "" : "s"}`);

  const fr = byId(from.responses);
  const tr = byId(to.responses);
  for (const r of to.responses) {
    const old = fr.get(r.id);
    if (!old) out.push(`Added response ${quote(r.title)}`);
    else {
      const { weights: ow, position: _op, ...oText } = old;
      const { weights: nw, position: _np, ...nText } = r;
      if (canonical(oText) !== canonical(nText)) out.push(`Edited response ${quote(r.title)}`);
      if (!weightsEqual(ow, nw)) out.push(`Changed the weights for response ${quote(r.title)}`);
    }
  }
  for (const r of from.responses) if (!tr.has(r.id)) out.push(`Removed response ${quote(r.title)}`);
  if (from.responses.map((r) => r.id).filter((id) => tr.has(id)).join() !== to.responses.map((r) => r.id).filter((id) => fr.has(id)).join()) {
    out.push("Reordered responses");
  }
  return out;
}

/* -------------------------------- Versions -------------------------------- */

export type VersionRow = typeof quizVersions.$inferSelect & { content: QuizContent };

export async function getVersion(db: Executor, quizId: number, number: number): Promise<VersionRow | null> {
  const [row] = await db
    .select()
    .from(quizVersions)
    .where(and(eq(quizVersions.quizId, quizId), eq(quizVersions.number, number)))
    .limit(1);
  return (row as VersionRow) ?? null;
}

export async function getVersionById(db: Executor, id: number): Promise<VersionRow | null> {
  const [row] = await db.select().from(quizVersions).where(eq(quizVersions.id, id)).limit(1);
  return (row as VersionRow) ?? null;
}

async function newestVersion(db: Executor, quizId: number): Promise<VersionRow | null> {
  const [row] = await db.select().from(quizVersions).where(eq(quizVersions.quizId, quizId)).orderBy(desc(quizVersions.number)).limit(1);
  return (row as VersionRow) ?? null;
}

/**
 * The version the public site serves. A published quiz from before versions
 * existed gets version 1 from its working copy on first use.
 */
export async function latestVersion(db: Executor, quizId: number): Promise<VersionRow | null> {
  const found = await newestVersion(db, quizId);
  if (found) return found;
  const [quiz] = await db.select({ status: quizzes.status }).from(quizzes).where(eq(quizzes.id, quizId)).limit(1);
  if (quiz?.status !== "published") return null;
  const content = await readWorkingContent(db, quizId);
  await db
    .insert(quizVersions)
    .values({ quizId, number: 1, content, note: "Created automatically from the quiz as it was published" })
    .onConflictDoNothing();
  return newestVersion(db, quizId);
}

/** Freezes the working copy as a new version, unless it's identical to the latest. */
export async function publishVersion(
  db: Database,
  quizId: number,
  by: string | null,
  note: string | null = null,
): Promise<{ version: VersionRow; created: boolean }> {
  return db.transaction(async (tx) => {
    await lockQuiz(tx, quizId);
    const content = await readWorkingContent(tx, quizId);
    const latest = await newestVersion(tx, quizId);
    if (latest && sameContent(latest.content, content)) return { version: latest, created: false };
    const [row] = await tx
      .insert(quizVersions)
      .values({ quizId, number: (latest?.number ?? 0) + 1, content, publishedBy: by, note: note?.trim().slice(0, 300) || null })
      .returning();
    return { version: row as VersionRow, created: true };
  });
}

export type VersionSummary = {
  number: number;
  publishedAt: Date;
  publishedBy: string | null;
  note: string | null;
  questions: number;
  responses: number;
  finished: number;
};

export async function listVersions(db: Executor, quizId: number): Promise<VersionSummary[]> {
  const rows = (await db
    .select()
    .from(quizVersions)
    .where(eq(quizVersions.quizId, quizId))
    .orderBy(desc(quizVersions.number))) as VersionRow[];
  if (!rows.length) return [];
  const finished = await db
    .select({ id: submissions.versionId, n: count() })
    .from(submissions)
    .where(inArray(submissions.versionId, rows.map((r) => r.id)))
    .groupBy(submissions.versionId);
  const f = new Map(finished.map((r) => [r.id, r.n]));
  return rows.map((r) => ({
    number: r.number,
    publishedAt: r.publishedAt,
    publishedBy: r.publishedBy,
    note: r.note,
    questions: r.content.questions.length,
    responses: r.content.responses.length,
    finished: f.get(r.id) ?? 0,
  }));
}

/** The draft's changes since the latest version (null when never published). */
export async function draftChanges(db: Executor, quizId: number): Promise<{ latest: VersionRow; changes: string[] } | null> {
  // latestVersion: a quiz published before versions existed gets its version 1 here too.
  const latest = await latestVersion(db, quizId);
  if (!latest) return null;
  return { latest, changes: diffContent(latest.content, await readWorkingContent(db, quizId)) };
}

/* --------------------------------- Restore -------------------------------- */

/**
 * Makes the working copy match a version again. Rows are matched by id:
 * existing ones are updated (and un-archived), missing ones re-created with
 * their old ids (so attempts and history still line up), and anything the
 * version doesn't have is archived if submissions use it, otherwise deleted.
 */
export async function restoreToDraft(db: Database, quizId: number, number: number): Promise<void> {
  const version = await getVersion(db, quizId, number);
  if (!version) throw new ContentError("not_found", "That version doesn't exist.");
  const c = version.content;
  await db.transaction(async (tx) => {
    await lockQuiz(tx, quizId);

    // Categories (no history of their own: deleting one only drops its weights).
    const catIds = c.categories.map((x) => x.id);
    await tx.delete(categories).where(and(eq(categories.quizId, quizId), catIds.length ? notInArray(categories.id, catIds) : undefined));
    // Park names and abbreviations first, so swapping them between categories can't clash.
    await tx
      .update(categories)
      .set({ name: sql`'~restore~' || ${categories.id}`, abbr: sql`right(${categories.id}::text, 6)` })
      .where(eq(categories.quizId, quizId));
    for (const x of c.categories) {
      const values = { name: x.name, abbr: x.abbr, color: x.color, importance: x.importance, position: x.position };
      const done = await tx.update(categories).set(values).where(and(eq(categories.id, x.id), eq(categories.quizId, quizId))).returning({ id: categories.id });
      if (!done.length) await tx.insert(categories).overridingSystemValue().values({ id: x.id, quizId, ...values });
    }

    // Questions and answers.
    const keepQ = c.questions.map((q) => q.id);
    const keepA = c.questions.flatMap((q) => q.answers.map((a) => a.id));
    const currentQ = await tx.select({ id: questions.id }).from(questions).where(eq(questions.quizId, quizId));
    const currentA = currentQ.length
      ? await tx.select({ id: answers.id }).from(answers).where(inArray(answers.questionId, currentQ.map((q) => q.id)))
      : [];
    const dropA = currentA.map((a) => a.id).filter((id) => !keepA.includes(id));
    if (dropA.length) {
      const used = new Set(
        (await tx.selectDistinct({ id: submissionAnswers.answerId }).from(submissionAnswers).where(inArray(submissionAnswers.answerId, dropA))).map((r) => r.id),
      );
      const archive = dropA.filter((id) => used.has(id));
      const remove = dropA.filter((id) => !used.has(id));
      if (archive.length) await tx.update(answers).set({ archivedAt: new Date() }).where(inArray(answers.id, archive));
      if (remove.length) await tx.delete(answers).where(inArray(answers.id, remove));
    }
    for (const q of currentQ.filter((q) => !keepQ.includes(q.id))) {
      const [{ n }] = await tx.select({ n: count() }).from(answers).where(eq(answers.questionId, q.id));
      if (n > 0) await tx.update(questions).set({ archivedAt: new Date() }).where(eq(questions.id, q.id));
      else await tx.delete(questions).where(eq(questions.id, q.id));
    }
    for (const q of c.questions) {
      const values = {
        title: q.title,
        helpHtml: q.helpHtml,
        type: q.type,
        minSelect: q.minSelect,
        maxSelect: q.maxSelect,
        required: q.required,
        splitMulti: q.splitMulti,
        position: q.position,
        archivedAt: null,
      };
      const done = await tx.update(questions).set(values).where(and(eq(questions.id, q.id), eq(questions.quizId, quizId))).returning({ id: questions.id });
      if (!done.length) await tx.insert(questions).overridingSystemValue().values({ id: q.id, quizId, ...values });
      for (const a of q.answers) {
        const av = { questionId: q.id, label: a.label, bodyHtml: a.bodyHtml, position: a.position, archivedAt: null };
        const ok = await tx.update(answers).set(av).where(eq(answers.id, a.id)).returning({ id: answers.id });
        if (!ok.length) await tx.insert(answers).overridingSystemValue().values({ id: a.id, ...av });
      }
    }
    if (keepA.length) await tx.delete(answerWeights).where(inArray(answerWeights.answerId, keepA));
    const aw = c.questions.flatMap((q) =>
      q.answers.flatMap((a) => Object.entries(a.weights).map(([cat, weight]) => ({ answerId: a.id, categoryId: Number(cat), weight }))),
    );
    if (aw.length) await tx.insert(answerWeights).values(aw);

    // Responses.
    const keepR = c.responses.map((r) => r.id);
    const currentR = await tx.select({ id: results.id }).from(results).where(eq(results.quizId, quizId));
    for (const r of currentR.filter((r) => !keepR.includes(r.id))) {
      const [{ n }] = await tx.select({ n: count() }).from(submissions).where(eq(submissions.resultId, r.id));
      if (n > 0) await tx.update(results).set({ archivedAt: new Date() }).where(eq(results.id, r.id));
      else {
        await tx.update(quizzes).set({ defaultResultId: null }).where(eq(quizzes.defaultResultId, r.id));
        await tx.delete(results).where(eq(results.id, r.id));
      }
    }
    for (const r of c.responses) {
      const values = { title: r.title, excerpt: r.excerpt, bodyHtml: r.bodyHtml, ctaUrl: r.ctaUrl, ctaLabel: r.ctaLabel, position: r.position, archivedAt: null };
      const done = await tx.update(results).set(values).where(and(eq(results.id, r.id), eq(results.quizId, quizId))).returning({ id: results.id });
      if (!done.length) await tx.insert(results).overridingSystemValue().values({ id: r.id, quizId, ...values });
    }
    if (keepR.length) await tx.delete(resultWeights).where(inArray(resultWeights.resultId, keepR));
    const rw = c.responses.flatMap((r) => Object.entries(r.weights).map(([cat, weight]) => ({ resultId: r.id, categoryId: Number(cat), weight })));
    if (rw.length) await tx.insert(resultWeights).values(rw);

    await tx
      .update(quizzes)
      .set({
        title: c.title,
        introHtml: c.introHtml,
        normalizePerCategory: c.scoring.normalizePerCategory,
        runnersUpCount: c.scoring.runnersUpCount,
        defaultResultId: c.scoring.defaultResultId,
        structureVersion: sql`${quizzes.structureVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(quizzes.id, quizId));
  });
}

/** Ids from a list that still exist as rows (e.g. a response deleted from the draft since). */
export async function existingResultIds(db: Executor, ids: number[]): Promise<Set<number>> {
  if (!ids.length) return new Set();
  const rows = await db.select({ id: results.id }).from(results).where(and(inArray(results.id, ids), isNotNull(results.id)));
  return new Set(rows.map((r) => r.id));
}

