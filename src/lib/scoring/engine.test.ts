import { describe, expect, it } from "vitest";
import {
  maxAchievable,
  reachableCategories,
  score,
  toPercentage,
  type ScoringModel,
  type ScoringQuestion,
  type ScoringResult,
  type Selection,
} from "./engine";

/* Small builders keep each test's numbers visible. */
const cats = (...ids: number[]) => ids.map((id) => ({ id, importance: 1 }));
const single = (id: number, ...answers: [number, Record<number, number>][]): ScoringQuestion => ({
  id,
  type: "single",
  splitMulti: false,
  maxSelect: 1,
  answers: answers.map(([aid, weights]) => ({ id: aid, weights })),
});
const result = (id: number, weights: Record<number, number>, position = id): ScoringResult => ({ id, position, weights });
const pick = (questionId: number, ...answerIds: number[]): Selection => ({ questionId, answerIds });
const codes = (r: { warnings: { code: string }[] }) => r.warnings.map((w) => w.code);

/** Q1: 11→Outdoors 3 | 12→Analytical 3.  Q2: 21→Outdoors 2 + People 1 | 22→Analytical 2. */
const base: ScoringModel = {
  categories: cats(1, 2, 3),
  questions: [single(1, [11, { 1: 3 }], [12, { 2: 3 }]), single(2, [21, { 1: 2, 3: 1 }], [22, { 2: 2 }])],
  results: [result(1, { 1: 5, 3: 1 }), result(2, { 2: 5 })],
  options: { normalizePerCategory: false },
};

describe("toPercentage", () => {
  it("matches the spec's reference points", () => {
    expect(toPercentage(0.95)).toBe(80);
    expect(toPercentage(0.8)).toBe(59);
    expect(toPercentage(0.7)).toBe(49);
    expect(toPercentage(0)).toBe(0);
  });
  it("is 100 only for a (near-)exact match and never negative", () => {
    expect(toPercentage(1)).toBe(100);
    expect(toPercentage(0.99995)).toBe(100);
    expect(toPercentage(0.9998)).toBe(99);
    expect(toPercentage(-0.5)).toBe(0);
    expect(toPercentage(-1)).toBe(0);
  });
});

describe("score: basics", () => {
  it("sums contributions and matches by cosine (hand-computed)", () => {
    const r = score(base, [pick(1, 11), pick(2, 21)]);
    expect(r.status).toBe("scored");
    expect(r.vector).toEqual({ 1: 5, 2: 0, 3: 1 });
    // User (5,0,1) is exactly parallel to Forester (5,0,1).
    expect(r.match?.resultId).toBe(1);
    expect(r.ranked[0].raw).toBeCloseTo(1, 10);
    expect(r.ranked[0].percent).toBe(100);
    expect(r.ranked[1]).toMatchObject({ resultId: 2, raw: 0, percent: 0 });
    expect(r.contributions).toEqual([
      { questionId: 1, answerIds: [11], vector: { 1: 3 } },
      { questionId: 2, answerIds: [21], vector: { 1: 2, 3: 1 } },
    ]);
    expect(r.engine).toBe("1");
  });

  it("computes a non-trivial cosine", () => {
    // User (3,2,0) vs Forester (5,0,1): 15 / (√13·√26) = 0.5883
    const r = score(base, [pick(1, 11), pick(2, 22)]);
    const forester = r.ranked.find((x) => x.resultId === 1)!;
    expect(forester.raw).toBeCloseTo(15 / (Math.sqrt(13) * Math.sqrt(26)), 10);
    // vs Analyst (0,5,0): 10 / (√13·5) = 0.5547 → Forester still first.
    expect(r.ranked.find((x) => x.resultId === 2)!.raw).toBeCloseTo(10 / (Math.sqrt(13) * 5), 10);
    expect(r.match?.resultId).toBe(1);
    expect(r.unit[1] ** 2 + r.unit[2] ** 2 + r.unit[3] ** 2).toBeCloseTo(1, 10);
  });

  it("lets negative weights count against a response", () => {
    const model: ScoringModel = {
      categories: cats(1, 2),
      questions: [single(1, [11, { 1: -3 }], [12, { 2: 1 }])],
      results: [result(1, { 1: 5 }), result(2, { 2: 5 })],
      options: { normalizePerCategory: false },
    };
    const r = score(model, [pick(1, 11)]);
    expect(r.ranked.map((x) => [x.resultId, x.raw])).toEqual([
      [2, 0],
      [1, -1],
    ]);
    expect(r.ranked[1].percent).toBe(0);
  });

  it("applies category importance", () => {
    const model: ScoringModel = { ...base, categories: [{ id: 1, importance: 2 }, ...cats(2, 3)] };
    const r = score(model, [pick(1, 11), pick(2, 21)]);
    expect(r.vector).toEqual({ 1: 10, 2: 0, 3: 1 });
    expect(r.maxAchievable[1]).toBe(10); // (3 + 2) × 2
  });

  it("gives a single response its honest percentage", () => {
    const r = score({ ...base, results: [result(2, { 2: 5 })] }, [pick(1, 11), pick(2, 22)]);
    expect(r.match).toMatchObject({ resultId: 2, percent: toPercentage(10 / (Math.sqrt(13) * 5)) });
    expect(r.isClose).toBe(false);
  });
});

describe("score: per-category normalization", () => {
  // Outdoors can score 9 (three answers), Analytical only 3.
  const imbalanced: ScoringModel = {
    categories: cats(1, 2),
    questions: [1, 2, 3].map((q) => single(q, [q * 10 + 1, { 1: 3 }], [q * 10 + 2, { 2: 1 }])),
    results: [result(1, { 1: 5 }), result(2, { 2: 5 })],
  };
  // Mostly analytical answers: A once, B twice → raw (3, 2).
  const answers = [pick(1, 11), pick(2, 22), pick(3, 32)];

  it("without it, the big category dominates (the 'always Forester' bug)", () => {
    const r = score({ ...imbalanced, options: { normalizePerCategory: false } }, answers);
    expect(r.match?.resultId).toBe(1);
  });

  it("with it, each category is judged against its own maximum", () => {
    const r = score(imbalanced, answers);
    expect(r.maxAchievable).toEqual({ 1: 9, 2: 3 });
    expect(r.normalized[1]).toBeCloseTo(3 / 9, 10);
    expect(r.normalized[2]).toBeCloseTo(2 / 3, 10);
    expect(r.match?.resultId).toBe(2);
  });
});

describe("score: multi-select", () => {
  const multi = (splitMulti: boolean): ScoringModel => ({
    categories: cats(1, 2),
    questions: [
      {
        id: 1,
        type: "multi",
        splitMulti,
        maxSelect: 3,
        answers: [
          { id: 11, weights: { 1: 3 } },
          { id: 12, weights: { 1: 3 } },
          { id: 13, weights: { 2: 3 } },
        ],
      },
    ],
    results: [result(1, { 1: 5 })],
    options: { normalizePerCategory: false },
  });

  it("adds every pick when split is off", () => {
    const r = score(multi(false), [pick(1, 11, 12, 13)]);
    expect(r.vector).toEqual({ 1: 6, 2: 3 });
    expect(maxAchievable(multi(false))).toEqual({ 1: 6, 2: 3 });
  });

  it("divides by the number of picks when split is on", () => {
    const r = score(multi(true), [pick(1, 11, 12, 13)]);
    expect(r.vector).toEqual({ 1: 2, 2: 1 });
    expect(maxAchievable(multi(true))).toEqual({ 1: 3, 2: 3 });
  });
});

describe("score: unreachable categories", () => {
  // Category 3 is only used by a response; no answer can ever score it.
  const model: ScoringModel = {
    categories: cats(1, 2, 3),
    questions: [single(1, [11, { 1: 3 }], [12, { 2: 3 }])],
    results: [result(1, { 1: 5, 3: 5 }), result(2, { 1: 5 })],
    options: { normalizePerCategory: false },
  };

  it("drops them by default, so they don't penalize responses that use them", () => {
    expect([...reachableCategories(model)].sort()).toEqual([1, 2]);
    const r = score(model, [pick(1, 11)]);
    expect(r.warnings).toContainEqual({ code: "unreachable_category", context: { categoryId: 3 } });
    // Both now point straight at Outdoors: a full tie broken by position.
    expect(r.ranked.map((x) => x.resultId)).toEqual([1, 2]);
    expect(r.ranked[0].raw).toBeCloseTo(1, 10);
  });

  it("keeps them when the option is off (and the response using them loses)", () => {
    const r = score({ ...model, options: { normalizePerCategory: false, dropUnreachable: false } }, [pick(1, 11)]);
    expect(r.match?.resultId).toBe(2);
    expect(r.ranked[1].raw).toBeCloseTo(5 / Math.sqrt(50), 10);
    expect(codes(r)).not.toContain("unreachable_category");
  });

  it("depends on the whole quiz, not the answers given", () => {
    expect(score(model, [pick(1, 12)]).normalized).toHaveProperty("1");
  });
});

describe("score: tie-breaking (deterministic)", () => {
  const opts = { normalizePerCategory: false };

  it("1. higher similarity wins", () => {
    const r = score({ ...base, results: [result(1, { 2: 5 }), result(2, { 1: 5 })] }, [pick(1, 11)]);
    expect(r.ranked.map((x) => x.resultId)).toEqual([2, 1]);
  });

  it("2. equal similarity: higher raw dot product wins", () => {
    const model: ScoringModel = {
      categories: cats(1),
      questions: [single(1, [11, { 1: 3 }])],
      results: [result(1, { 1: 2 }, 0), result(2, { 1: 4 }, 1)],
      options: opts,
    };
    const r = score(model, [pick(1, 11)]);
    expect(r.ranked.map((x) => [x.resultId, x.dot])).toEqual([
      [2, 12],
      [1, 6],
    ]);
  });

  it("3. equal similarity and dot: more overlapping categories wins", () => {
    // User (1, 1, −1, 0). R1 (2, 1, 1, 0) and R2 (2, 0, 0, √2) both have |R| = √6, dot = 2.
    const model: ScoringModel = {
      categories: cats(1, 2, 3, 4),
      questions: [
        single(1, [11, { 1: 1, 2: 1, 3: -1 }]),
        single(2, [21, { 4: 1 }]), // makes category 4 reachable, not chosen
      ],
      results: [result(2, { 1: 2, 4: Math.SQRT2 }, 0), result(1, { 1: 2, 2: 1, 3: 1 }, 1)],
      options: opts,
    };
    const r = score(model, [pick(1, 11)]);
    expect(r.ranked[0].raw).toBeCloseTo(r.ranked[1].raw, 9);
    expect(r.ranked[0].dot).toBeCloseTo(r.ranked[1].dot, 9);
    expect(r.ranked.map((x) => [x.resultId, x.overlap])).toEqual([
      [1, 3],
      [2, 1],
    ]);
  });

  it("4. then the author's order (position)", () => {
    const model = { ...base, results: [result(1, { 1: 5 }, 2), result(2, { 1: 5 }, 1)] };
    expect(score(model, [pick(1, 11)]).ranked.map((x) => x.resultId)).toEqual([2, 1]);
  });

  it("5. then the lower id", () => {
    const model = { ...base, results: [result(7, { 1: 5 }, 0), result(3, { 1: 5 }, 0)] };
    expect(score(model, [pick(1, 11)]).ranked.map((x) => x.resultId)).toEqual([3, 7]);
  });
});

describe("score: close calls", () => {
  it("flags a top two within 0.02", () => {
    const model = { ...base, results: [result(1, { 1: 5, 2: 1 }), result(2, { 1: 5, 2: 1.2 })] };
    expect(score(model, [pick(1, 11)]).isClose).toBe(true);
  });
  it("doesn't flag a clear winner", () => {
    expect(score(base, [pick(1, 11), pick(2, 21)]).isClose).toBe(false);
  });
});

describe("score: edge cases", () => {
  it("returns no_results when the quiz has no responses", () => {
    const r = score({ ...base, results: [] }, [pick(1, 11)]);
    expect(r).toMatchObject({ status: "no_results", match: null, ranked: [] });
  });

  it("excludes responses with no weights, and says so", () => {
    const r = score({ ...base, results: [result(1, {}), result(2, { 1: 5 })] }, [pick(1, 11)]);
    expect(r.ranked.map((x) => x.resultId)).toEqual([2]);
    expect(r.warnings).toContainEqual({ code: "empty_weight_vector", context: { resultId: 1 } });
    expect(score({ ...base, results: [result(1, { 1: 0 })] }, [pick(1, 11)]).status).toBe("no_results");
  });

  it("never invents a winner from no information", () => {
    const r = score(base, []);
    expect(r).toMatchObject({ status: "insufficient_data", match: null, isFallback: false });
  });

  it("uses the configured fallback when the answers carry no signal", () => {
    const model: ScoringModel = {
      ...base,
      questions: [...base.questions, single(3, [31, { 1: 0 }])],
      options: { defaultResultId: 2 },
    };
    const r = score(model, [pick(3, 31)]);
    expect(r).toMatchObject({ status: "insufficient_data", isFallback: true, match: { resultId: 2 } });
  });

  it("deduplicates repeated selections", () => {
    const r = score(base, [pick(1, 11, 11), pick(1, 11), pick(2, 21)]);
    expect(r.vector).toEqual({ 1: 5, 2: 0, 3: 1 });
  });

  it("keeps only the first answer on a single-choice question", () => {
    const r = score(base, [pick(1, 11, 12)]);
    expect(r.vector).toEqual({ 1: 3, 2: 0, 3: 0 });
    expect(codes(r)).toContain("multiple_answers_single_question");
  });

  it("treats non-numeric and infinite weights as 0", () => {
    const model: ScoringModel = {
      ...base,
      questions: [single(1, [11, { 1: Number.NaN, 2: Number.POSITIVE_INFINITY, 3: 2 }])],
    };
    const r = score(model, [pick(1, 11)]);
    expect(r.vector).toEqual({ 1: 0, 2: 0, 3: 2 });
    expect(codes(r).filter((c) => c === "non_finite_weight")).toHaveLength(2);
  });

  it("ignores unknown questions, answers and categories, with warnings", () => {
    const model: ScoringModel = { ...base, questions: [single(1, [11, { 1: 3, 99: 4 }])] };
    const r = score(model, [pick(1, 11, 999), pick(42, 1)]);
    expect(r.vector).toEqual({ 1: 3, 2: 0, 3: 0 });
    expect(codes(r)).toEqual(expect.arrayContaining(["unknown_answer", "unknown_question", "unknown_category"]));
  });
});

describe("score: partial completion", () => {
  it("points the same way after a few consistent answers as after all of them", () => {
    const questions = [1, 2, 3, 4].map((q) => single(q, [q * 10 + 1, { 1: 3, 3: 1 }], [q * 10 + 2, { 2: 3 }]));
    const model: ScoringModel = { categories: cats(1, 2, 3), questions, results: base.results };
    const partial = score(model, [pick(1, 11), pick(2, 21)]);
    const full = score(model, [pick(1, 11), pick(2, 21), pick(3, 31), pick(4, 41)]);
    expect(partial.match?.resultId).toBe(full.match?.resultId);
    expect(partial.ranked[0].raw).toBeCloseTo(full.ranked[0].raw, 10);
  });
});
