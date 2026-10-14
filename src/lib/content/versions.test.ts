import { describe, expect, it } from "vitest";
import { canonical, diffContent, type QuizContent } from "./versions";

const base: QuizContent = {
  title: "Green Jobs",
  introHtml: "<p>Hi</p>",
  scoring: { normalizePerCategory: true, runnersUpCount: 2, defaultResultId: null },
  categories: [
    { id: 1, name: "Outdoors", abbr: "OUTD", color: "#3f7d4e", importance: 1, position: 0 },
    { id: 2, name: "Analytical", abbr: "ANLY", color: "#2f6690", importance: 1, position: 1 },
  ],
  questions: [
    { id: 10, title: "Weekend?", helpHtml: null, type: "single", minSelect: 1, maxSelect: 1, required: true, splitMulti: false, position: 0, answers: [{ id: 100, label: "Hike", bodyHtml: null, position: 0, weights: { "1": 3 } }] },
    { id: 11, title: "Tools?", helpHtml: null, type: "single", minSelect: 1, maxSelect: 1, required: true, splitMulti: false, position: 1, answers: [{ id: 110, label: "Saw", bodyHtml: null, position: 0, weights: { "1": 2 } }] },
  ],
  responses: [{ id: 50, title: "Forester", excerpt: null, bodyHtml: "", ctaUrl: null, ctaLabel: null, position: 0, weights: { "1": 5 } }],
};

describe("diffContent", () => {
  it("is empty for the same content, whatever the key order", () => {
    const reverseKeys = (v: unknown): unknown =>
      Array.isArray(v) ? v.map(reverseKeys) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reverseKeys(x)])) : v;
    const shuffled = reverseKeys(base);
    expect(canonical(shuffled)).toBe(canonical(base));
    expect(diffContent(base, structuredClone(base))).toEqual([]);
  });

  it("lists added, removed, reordered and re-weighted items", () => {
    const next = structuredClone(base);
    next.questions = [next.questions[1], { ...next.questions[0], id: 12, title: "New?" }];
    next.categories.pop();
    next.responses[0].weights = { "1": 4 };
    next.responses.push({ ...next.responses[0], id: 51, title: "Analyst" });
    next.scoring.runnersUpCount = 1;
    expect(diffContent(base, next)).toEqual([
      "Changed scoring settings",
      "Removed category “Analytical”",
      "Added question 2 “New?”",
      "Removed question “Weekend?”",
      "Changed the weights for response “Forester”",
      "Added response “Analyst”",
    ]);
    const reordered = structuredClone(base);
    reordered.questions.reverse();
    expect(diffContent(base, reordered)).toEqual(["Reordered questions"]);
  });
});
