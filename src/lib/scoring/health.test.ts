import { describe, expect, it } from "vitest";
import type { ScoringQuestion } from "./engine";
import { healthReport, type HealthInput } from "./health";

function input(overrides: Partial<HealthInput> = {}): HealthInput {
  return {
    categories: [1, 2, 3].map((id) => ({ id, importance: 1 })),
    questions: [
      { id: 1, type: "single", splitMulti: false, maxSelect: 1, answers: [{ id: 11, weights: { 1: 3 } }, { id: 12, weights: { 2: 3 } }] },
      { id: 2, type: "single", splitMulti: false, maxSelect: 1, answers: [{ id: 21, weights: { 3: 2 } }, { id: 22, weights: { 1: 1 } }] },
    ],
    results: [
      { id: 1, position: 0, weights: { 1: 5 } },
      { id: 2, position: 1, weights: { 2: 5 } },
      { id: 3, position: 2, weights: { 3: 5 } },
    ],
    runnersUpCount: 2,
    names: {
      categories: { 1: "Outdoors", 2: "Analytical", 3: "People" },
      questions: { 1: "Q1", 2: "Q2", 3: "Q3" },
      answers: { 11: "A11", 12: "A12", 21: "A21", 22: "A22", 31: "A31", 32: "A32" },
      results: { 1: "Forester", 2: "Analyst", 3: "Educator", 4: "Ranger" },
    },
    ...overrides,
  };
}
const items = (report: ReturnType<typeof healthReport>, id: string) =>
  report.checks.find((c) => c.id === id)!.items.map((i) => i.label);

describe("healthReport", () => {
  it("is clean for a well-formed quiz", () => {
    const report = healthReport(input());
    expect(report.warningCount).toBe(0);
    expect(report.balance.map((b) => [b.name, b.max])).toEqual([
      ["Outdoors", 4],
      ["Analytical", 3],
      ["People", 2],
    ]);
  });

  it("finds every authoring problem", () => {
    const base = input();
    const report = healthReport(
      input({
        questions: [
          ...base.questions,
          { id: 3, type: "single", splitMulti: false, maxSelect: 1, answers: [{ id: 31, weights: {} }] },
          {
            id: 4,
            type: "single",
            splitMulti: false,
            maxSelect: 1,
            answers: [
              { id: 41, weights: { 1: 2 } },
              { id: 42, weights: { 1: 2 } },
            ],
          },
        ],
        results: [...base.results.slice(0, 2), { id: 4, position: 3, weights: { 1: 4.9, 2: 0.2 } }],
        runnersUpCount: 3,
        names: { ...base.names, questions: { ...base.names.questions, 4: "Q4" }, answers: { ...base.names.answers, 41: "A41", 42: "A42" } },
      }),
    );
    expect(items(report, "few-answers")).toEqual(["Q3"]);
    expect(items(report, "zero-answers")).toEqual(["Q3 → A31"]);
    expect(items(report, "flat-questions")).toEqual(["Q4"]);
    expect(items(report, "few-responses")).toEqual(["3 of 4"]);
    expect(items(report, "near-duplicates")[0]).toMatch(/^Forester and Ranger \(\d+% similar\)$/);
    expect(items(report, "unused-categories")).toEqual(["People"]);
    expect(report.warningCount).toBe(5);
  });

  it("flags responses with no weights and categories no answer scores", () => {
    const base = input();
    const report = healthReport(
      input({
        questions: [base.questions[0]],
        results: [...base.results, { id: 4, position: 3, weights: {} }],
      }),
    );
    expect(items(report, "zero-responses")).toEqual(["Ranger"]);
    expect(report.checks.find((c) => c.id === "zero-responses")!.items[0].target).toEqual({ tab: "response", responseId: 4 });
    expect(items(report, "unanswerable-categories")).toEqual(["People"]);
  });

  it("flags an empty quiz", () => {
    const report = healthReport(input({ categories: [], questions: [], results: [] }));
    expect(items(report, "no-categories")).toHaveLength(1);
    expect(items(report, "few-responses")).toEqual(["0 of 3"]);
  });

  it("reports category imbalance, as a warning only when balancing is off", () => {
    const base = input();
    const heavy = input({
      questions: [
        ...base.questions,
        ...[5, 6, 7].map(
          (id): ScoringQuestion => ({
            id,
            type: "single",
            splitMulti: false,
            maxSelect: 1,
            answers: [
              { id: id * 10 + 1, weights: { 1: 5 } },
              { id: id * 10 + 2, weights: { 2: 1 } },
            ],
          }),
        ),
      ],
    });
    const on = healthReport(heavy);
    expect(on.checks.find((c) => c.id === "imbalance")).toMatchObject({ severity: "info" });
    expect(items(on, "imbalance")[0]).toMatch(/^Outdoors can reach 19, People only 2$/);
    const off = healthReport({ ...heavy, options: { normalizePerCategory: false } });
    expect(off.checks.find((c) => c.id === "imbalance")).toMatchObject({ severity: "warning" });
  });
});
