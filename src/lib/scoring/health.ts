/**
 * Authoring health checks for one quiz. Pure. Warn, never block.
 */
import { maxAchievable, reachableCategories, type ScoringModel } from "./engine";
import { nearDuplicates } from "./vector";

export type HealthInput = ScoringModel & {
  runnersUpCount: number;
  names: {
    categories: Record<number, string>;
    questions: Record<number, string>;
    answers: Record<number, string>;
    results: Record<number, string>;
  };
};

export type HealthTarget =
  | { tab: "categories" }
  | { tab: "questions" }
  | { tab: "responses" }
  | { tab: "response"; responseId: number };

export type HealthCheck = {
  id: string;
  severity: "warning" | "info";
  title: string;
  /** Why it matters, in one sentence. */
  why: string;
  items: { label: string; target: HealthTarget }[];
};

export type CategoryBalance = { categoryId: number; name: string; max: number; answerUses: number; responseUses: number };

export type HealthReport = {
  checks: HealthCheck[];
  /** Number of warning items (what the tab label shows). */
  warningCount: number;
  balance: CategoryBalance[];
};

const IMBALANCE_RATIO = 3;
const nonZero = (weights: Record<number, number>) =>
  Object.values(weights).filter((w) => Number.isFinite(w) && w !== 0).length;
const sameVector = (a: Record<number, number>, b: Record<number, number>, ids: number[]) =>
  ids.every((id) => (a[id] ?? 0) === (b[id] ?? 0));

export function healthReport(input: HealthInput): HealthReport {
  const { names } = input;
  const categoryIds = input.categories.map((c) => c.id);
  const checks: HealthCheck[] = [];
  const add = (check: Omit<HealthCheck, "items">, items: HealthCheck["items"]) => checks.push({ ...check, items });

  add(
    { id: "no-categories", severity: "warning", title: "The quiz has no categories", why: "Answers and responses are scored against categories." },
    input.categories.length === 0 ? [{ label: "Add categories", target: { tab: "categories" } }] : [],
  );

  add(
    {
      id: "few-answers",
      severity: "warning",
      title: "Questions with fewer than two answers",
      why: "A question needs a choice to tell respondents apart.",
    },
    input.questions
      .filter((q) => q.answers.length < 2)
      .map((q) => ({ label: names.questions[q.id], target: { tab: "questions" } })),
  );

  add(
    {
      id: "zero-answers",
      severity: "warning",
      title: "Answers with no weights",
      why: "Picking these answers has no effect on the result.",
    },
    input.questions.flatMap((q) =>
      q.answers
        .filter((a) => nonZero(a.weights) === 0)
        .map((a) => ({ label: `${names.questions[q.id]} → ${names.answers[a.id]}`, target: { tab: "questions" } as const })),
    ),
  );

  add(
    {
      id: "flat-questions",
      severity: "warning",
      title: "Questions where every answer has the same weights",
      why: "Whatever someone picks, the result is the same, so the question does nothing.",
    },
    input.questions
      .filter((q) => q.answers.length >= 2 && q.answers.every((a) => sameVector(a.weights, q.answers[0].weights, categoryIds)))
      .filter((q) => nonZero(q.answers[0].weights) > 0) // all-zero answers are reported above
      .map((q) => ({ label: names.questions[q.id], target: { tab: "questions" } })),
  );

  add(
    {
      id: "zero-responses",
      severity: "warning",
      title: "Responses with no weights",
      why: "A response with no weights can never be recommended.",
    },
    input.results
      .filter((r) => nonZero(r.weights) === 0)
      .map((r) => ({ label: names.results[r.id], target: { tab: "response", responseId: r.id } })),
  );

  const needed = input.runnersUpCount + 1;
  add(
    {
      id: "few-responses",
      severity: "warning",
      title: `Fewer than ${needed} responses`,
      why: `Results show the top match and ${input.runnersUpCount} runner${input.runnersUpCount === 1 ? "" : "s"}-up.`,
    },
    input.results.length < needed
      ? [{ label: `${input.results.length} of ${needed}`, target: { tab: "responses" } }]
      : [],
  );

  add(
    {
      id: "near-duplicates",
      severity: "warning",
      title: "Responses with nearly the same profile",
      why: "Respondents get one or the other almost by chance; this is the top cause of “wrong answer” complaints.",
    },
    nearDuplicates(input.results).map((d) => ({
      label: `${names.results[d.a.id]} and ${names.results[d.b.id]} (${Math.round(d.similarity * 100)}% similar)`,
      target: { tab: "responses" } as const,
    })),
  );

  const reachable = reachableCategories(input);
  const usedByResponses = new Set(input.results.flatMap((r) => Object.keys(r.weights).filter((k) => r.weights[Number(k)] !== 0).map(Number)));
  add(
    {
      id: "unanswerable-categories",
      severity: "warning",
      title: "Categories no answer scores",
      why: "Respondents can never score these, so they're ignored when matching.",
    },
    input.categories
      .filter((c) => !reachable.has(c.id))
      .map((c) => ({ label: names.categories[c.id], target: { tab: "questions" } })),
  );
  add(
    {
      id: "unused-categories",
      severity: "info",
      title: "Categories no response uses",
      why: "Scoring in these categories can't point anyone toward a particular response.",
    },
    input.categories
      .filter((c) => !usedByResponses.has(c.id))
      .map((c) => ({ label: names.categories[c.id], target: { tab: "responses" } })),
  );

  // Coverage balance: how much each category can score.
  const max = maxAchievable(input);
  const balance: CategoryBalance[] = input.categories.map((c) => ({
    categoryId: c.id,
    name: names.categories[c.id],
    max: max[c.id] ?? 0,
    answerUses: input.questions.reduce((n, q) => n + q.answers.filter((a) => (a.weights[c.id] ?? 0) !== 0).length, 0),
    responseUses: input.results.filter((r) => (r.weights[c.id] ?? 0) !== 0).length,
  }));
  const positive = balance.filter((b) => b.max > 0);
  const normalizing = input.options?.normalizePerCategory ?? true;
  if (positive.length >= 2) {
    const top = positive.reduce((a, b) => (b.max > a.max ? b : a));
    const bottom = positive.reduce((a, b) => (b.max < a.max ? b : a));
    add(
      {
        id: "imbalance",
        severity: normalizing ? "info" : "warning",
        title: "Categories with very different maximum scores",
        why: normalizing
          ? "“Balance categories” is on, so scoring evens this out, but answer coverage is uneven."
          : "With “Balance categories” off, the bigger category will dominate most results.",
      },
      top.max >= IMBALANCE_RATIO * bottom.max
        ? [{ label: `${top.name} can reach ${round(top.max)}, ${bottom.name} only ${round(bottom.max)}`, target: { tab: "questions" } }]
        : [],
    );
  }

  return {
    checks,
    warningCount: checks.filter((c) => c.severity === "warning").reduce((n, c) => n + c.items.length, 0),
    balance,
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
