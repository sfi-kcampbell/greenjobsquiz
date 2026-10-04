/**
 * Questions and their answers. A question is always saved together with
 * all of its answers and weights, in one transaction, so a card in the
 * builder is either fully saved or not at all.
 */
import { and, asc, count, eq, inArray, isNull, max, sql } from "drizzle-orm";
import type { Database, Executor } from "@/lib/db/create";
import { answers, answerWeights, categories, questions, submissionAnswers } from "@/lib/db/schema";
import { sanitizeRichText } from "@/lib/sanitize/rich-text";
import { ContentError } from "./errors";
import { bumpStructureVersion, lockQuiz } from "./quizzes";
import { MAX_QUESTIONS, type QuestionInput } from "./validation";

export type AnswerView = {
  id: number;
  label: string;
  bodyHtml: string | null;
  position: number;
  /** categoryId → weight; zero weights are absent. */
  weights: Record<number, number>;
};

export type QuestionView = {
  id: number;
  title: string;
  helpHtml: string | null;
  type: "single" | "multi";
  minSelect: number;
  maxSelect: number;
  required: boolean;
  splitMulti: boolean;
  position: number;
  answers: AnswerView[];
};

export async function listQuestions(db: Executor, quizId: number): Promise<QuestionView[]> {
  const qs = await db
    .select()
    .from(questions)
    .where(and(eq(questions.quizId, quizId), isNull(questions.archivedAt)))
    .orderBy(asc(questions.position), asc(questions.id));
  if (qs.length === 0) return [];

  const ans = await db
    .select()
    .from(answers)
    .where(and(inArray(answers.questionId, qs.map((q) => q.id)), isNull(answers.archivedAt)))
    .orderBy(asc(answers.position), asc(answers.id));

  const ws = ans.length
    ? await db.select().from(answerWeights).where(inArray(answerWeights.answerId, ans.map((a) => a.id)))
    : [];

  const weightsByAnswer = new Map<number, Record<number, number>>();
  for (const w of ws) {
    const map = weightsByAnswer.get(w.answerId) ?? {};
    map[w.categoryId] = w.weight;
    weightsByAnswer.set(w.answerId, map);
  }

  const answersByQuestion = new Map<number, AnswerView[]>();
  for (const a of ans) {
    const list = answersByQuestion.get(a.questionId) ?? [];
    list.push({
      id: a.id,
      label: a.label,
      bodyHtml: a.bodyHtml,
      position: a.position,
      weights: weightsByAnswer.get(a.id) ?? {},
    });
    answersByQuestion.set(a.questionId, list);
  }

  return qs.map((q) => ({
    id: q.id,
    title: q.title,
    helpHtml: q.helpHtml,
    type: q.type,
    minSelect: q.minSelect,
    maxSelect: q.maxSelect,
    required: q.required,
    splitMulti: q.splitMulti,
    position: q.position,
    answers: answersByQuestion.get(q.id) ?? [],
  }));
}

/** Answer ids (from `ids`) that some submission refers to, so they must be archived, not deleted. */
async function referencedAnswers(tx: Executor, ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const rows = await tx
    .selectDistinct({ id: submissionAnswers.answerId })
    .from(submissionAnswers)
    .where(inArray(submissionAnswers.answerId, ids));
  return new Set(rows.map((r) => r.id));
}

export type SaveQuestionResult = {
  questionId: number;
  /** Client row key → answer id, so new rows learn their ids. */
  answerIds: Record<string, number>;
};

export async function saveQuestion(
  db: Database,
  quizId: number,
  input: QuestionInput,
): Promise<SaveQuestionResult> {
  return db.transaction(async (tx) => {
    await lockQuiz(tx, quizId);

    const fields = {
      title: input.title,
      helpHtml: sanitizeRichText(input.helpHtml),
      type: input.type,
      minSelect: input.minSelect,
      maxSelect: input.maxSelect,
      required: input.required,
      splitMulti: input.splitMulti,
    };

    // 1. The question itself.
    let questionId: number;
    if (input.id === null) {
      const [{ n }] = await tx
        .select({ n: count() })
        .from(questions)
        .where(and(eq(questions.quizId, quizId), isNull(questions.archivedAt)));
      if (n >= MAX_QUESTIONS) {
        throw new ContentError("limit", `A quiz can have at most ${MAX_QUESTIONS} questions.`);
      }
      const [{ last }] = await tx
        .select({ last: max(questions.position) })
        .from(questions)
        .where(eq(questions.quizId, quizId));
      const [row] = await tx
        .insert(questions)
        .values({ ...fields, quizId, position: (last ?? -1) + 1 })
        .returning({ id: questions.id });
      questionId = row.id;
    } else {
      const updated = await tx
        .update(questions)
        .set(fields)
        .where(and(eq(questions.id, input.id), eq(questions.quizId, quizId), isNull(questions.archivedAt)))
        .returning({ id: questions.id });
      if (updated.length === 0) throw new ContentError("not_found", "That question no longer exists.");
      questionId = input.id;
    }

    // 2. Check the answers and weights refer only to this question and quiz.
    const existing = await tx
      .select({ id: answers.id })
      .from(answers)
      .where(and(eq(answers.questionId, questionId), isNull(answers.archivedAt)));
    const existingIds = new Set(existing.map((a) => a.id));
    for (const a of input.answers) {
      if (a.id !== null && !existingIds.has(a.id)) {
        throw new ContentError("invalid", "This question changed somewhere else. Reload and try again.");
      }
    }

    const quizCategories = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.quizId, quizId));
    const categoryIds = new Set(quizCategories.map((c) => c.id));
    for (const a of input.answers) {
      for (const key of Object.keys(a.weights)) {
        if (!categoryIds.has(Number(key))) {
          throw new ContentError("invalid", "A category was removed while you were editing. Reload and try again.");
        }
      }
    }

    // 3. Answers dropped from the card: archive if a submission used them, else delete.
    const keptIds = new Set(input.answers.flatMap((a) => (a.id === null ? [] : [a.id])));
    const removed = [...existingIds].filter((id) => !keptIds.has(id));
    const referenced = await referencedAnswers(tx, removed);
    const toArchive = removed.filter((id) => referenced.has(id));
    const toDelete = removed.filter((id) => !referenced.has(id));
    if (toArchive.length) {
      await tx.update(answers).set({ archivedAt: new Date() }).where(inArray(answers.id, toArchive));
    }
    if (toDelete.length) {
      await tx.delete(answers).where(inArray(answers.id, toDelete));
    }

    // 4. Upsert answers in the order given (positions 0..n).
    const answerIds: Record<string, number> = {};
    for (const [position, a] of input.answers.entries()) {
      const values = { label: a.label, bodyHtml: sanitizeRichText(a.bodyHtml), position };
      if (a.id === null) {
        const [row] = await tx
          .insert(answers)
          .values({ ...values, questionId })
          .returning({ id: answers.id });
        answerIds[a.key] = row.id;
      } else {
        await tx.update(answers).set(values).where(eq(answers.id, a.id));
        answerIds[a.key] = a.id;
      }
    }

    // 5. Replace weights for these answers; only non-zero values are stored.
    const savedIds = Object.values(answerIds);
    if (savedIds.length) {
      await tx.delete(answerWeights).where(inArray(answerWeights.answerId, savedIds));
      const rows = input.answers.flatMap((a) =>
        Object.entries(a.weights)
          .filter(([, w]) => w !== 0)
          .map(([categoryId, weight]) => ({ answerId: answerIds[a.key], categoryId: Number(categoryId), weight })),
      );
      if (rows.length) await tx.insert(answerWeights).values(rows);
    }

    await bumpStructureVersion(tx, quizId);
    return { questionId, answerIds };
  });
}

/** Archives the question if a submission used it (keeping history), otherwise deletes it. */
export async function deleteQuestion(db: Database, quizId: number, id: number): Promise<void> {
  await db.transaction(async (tx) => {
    await lockQuiz(tx, quizId);
    const [question] = await tx
      .select({ id: questions.id })
      .from(questions)
      .where(and(eq(questions.id, id), eq(questions.quizId, quizId), isNull(questions.archivedAt)));
    if (!question) throw new ContentError("not_found", "That question no longer exists.");

    const [{ n }] = await tx
      .select({ n: count() })
      .from(submissionAnswers)
      .where(eq(submissionAnswers.questionId, id));

    if (n > 0) {
      const now = new Date();
      await tx.update(questions).set({ archivedAt: now }).where(eq(questions.id, id));
      await tx
        .update(answers)
        .set({ archivedAt: now })
        .where(and(eq(answers.questionId, id), isNull(answers.archivedAt)));
    } else {
      await tx.delete(questions).where(eq(questions.id, id));
    }
    await bumpStructureVersion(tx, quizId);
  });
}

/** `orderedIds` must be exactly the quiz's current (non-archived) questions. */
export async function reorderQuestions(db: Database, quizId: number, orderedIds: number[]): Promise<void> {
  await db.transaction(async (tx) => {
    await lockQuiz(tx, quizId);
    const existing = await tx
      .select({ id: questions.id })
      .from(questions)
      .where(and(eq(questions.quizId, quizId), isNull(questions.archivedAt)));
    const existingIds = new Set(existing.map((r) => r.id));
    const unique = new Set(orderedIds);
    if (
      unique.size !== orderedIds.length ||
      unique.size !== existingIds.size ||
      orderedIds.some((id) => !existingIds.has(id))
    ) {
      throw new ContentError("invalid", "The questions changed while you were reordering. Reload and try again.");
    }
    if (orderedIds.length > 0) {
      const cases = sql.join(
        orderedIds.map((id, index) => sql`when ${id}::int then ${index}::int`),
        sql` `,
      );
      await tx
        .update(questions)
        .set({ position: sql`case ${questions.id} ${cases} end` })
        .where(and(eq(questions.quizId, quizId), inArray(questions.id, orderedIds)));
    }
    await bumpStructureVersion(tx, quizId);
  });
}
