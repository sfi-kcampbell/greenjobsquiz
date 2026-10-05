import { describe, expect, it } from "vitest";
import { score, type ScoringModel, type ScoringQuestion } from "./engine";
import { findAnswersFor } from "./search";

const model: ScoringModel = {
  categories: [1, 2, 3].map((id) => ({ id, importance: 1 })),
  questions: [1, 2, 3].map(
    (q): ScoringQuestion => ({
    id: q,
    type: "single",
    splitMulti: false,
    maxSelect: 1,
    answers: [
      { id: q * 10 + 1, weights: { 1: 3 } },
      { id: q * 10 + 2, weights: { 2: 3 } },
      { id: q * 10 + 3, weights: { 3: 3 } },
    ],
  }),
  ),
  results: [
    { id: 1, position: 0, weights: { 1: 5, 2: 1 } },
    { id: 2, position: 1, weights: { 2: 5 } },
    { id: 3, position: 2, weights: { 3: 4, 1: 1 } },
  ],
};

describe("findAnswersFor", () => {
  it.each([1, 2, 3])("finds answers where response %i wins, answering every question", (target) => {
    const outcome = findAnswersFor(model, target);
    expect(outcome.wins).toBe(true);
    expect(outcome.selections).toHaveLength(3);
    expect(score(model, outcome.selections).match?.resultId).toBe(target);
  });

  it("reports a negative margin for a response that can't win", () => {
    // Response 4 is a strictly weaker copy of response 2's direction plus noise nobody can score.
    const hopeless: ScoringModel = {
      ...model,
      results: [...model.results, { id: 4, position: 3, weights: { 2: 5 } }],
    };
    // Identical profile to response 2, which sorts first by position: 4 can never be the top match.
    const outcome = findAnswersFor(hopeless, 4);
    expect(outcome.wins).toBe(false);
    expect(outcome.margin).toBeLessThanOrEqual(0);
  });
});
