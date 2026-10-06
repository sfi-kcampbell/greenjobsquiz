/**
 * Loads everything the scoring engine and health checks need for one quiz,
 * plus display names for the admin UI.
 */
import type { Executor } from "@/lib/db/create";
import type { ScoringModel } from "@/lib/scoring/engine";
import type { HealthInput } from "@/lib/scoring/health";
import { listCategories } from "./categories";
import { ContentError } from "./errors";
import { listQuestions } from "./questions";
import { getQuiz } from "./quizzes";
import { listResponses } from "./responses";

export type ScoringBundle = {
  model: ScoringModel;
  health: HealthInput;
  display: {
    categories: { id: number; name: string; abbr: string; color: string }[];
    questions: { id: number; title: string; type: "single" | "multi"; maxSelect: number; answers: { id: number; label: string }[] }[];
    results: { id: number; title: string }[];
  };
  settings: { runnersUpCount: number; normalizePerCategory: boolean; defaultResultId: number | null };
};

export async function loadScoringBundle(db: Executor, quizId: number): Promise<ScoringBundle> {
  const quiz = await getQuiz(db, quizId);
  if (!quiz) throw new ContentError("not_found", "That quiz no longer exists.");
  // One after another: `db` may be a transaction, whose single connection
  // can't run queries concurrently (pg warns now and will refuse in pg 9).
  const cats = await listCategories(db, quizId);
  const questions = await listQuestions(db, quizId);
  const responses = await listResponses(db, quizId);

  const settings = {
    runnersUpCount: quiz.runnersUpCount,
    normalizePerCategory: quiz.normalizePerCategory,
    defaultResultId: quiz.defaultResultId,
  };

  const model: ScoringModel = {
    categories: cats.map((c) => ({ id: c.id, importance: c.importance })),
    questions: questions.map((q) => ({
      id: q.id,
      type: q.type,
      splitMulti: q.splitMulti,
      maxSelect: q.maxSelect,
      answers: q.answers.map((a) => ({ id: a.id, weights: a.weights })),
    })),
    results: responses.map((r) => ({ id: r.id, position: r.position, weights: r.weights })),
    options: { normalizePerCategory: settings.normalizePerCategory, defaultResultId: settings.defaultResultId },
  };

  const names = {
    categories: Object.fromEntries(cats.map((c) => [c.id, c.name])),
    questions: Object.fromEntries(questions.map((q, i) => [q.id, `${i + 1}. ${q.title}`])),
    answers: Object.fromEntries(questions.flatMap((q) => q.answers.map((a) => [a.id, a.label]))),
    results: Object.fromEntries(responses.map((r) => [r.id, r.title])),
  };

  return {
    model,
    health: { ...model, runnersUpCount: settings.runnersUpCount, names },
    display: {
      categories: cats.map(({ id, name, abbr, color }) => ({ id, name, abbr, color })),
      questions: questions.map((q) => ({
        id: q.id,
        title: q.title,
        type: q.type,
        maxSelect: q.maxSelect,
        answers: q.answers.map((a) => ({ id: a.id, label: a.label })),
      })),
      results: responses.map((r) => ({ id: r.id, title: r.title })),
    },
    settings,
  };
}
