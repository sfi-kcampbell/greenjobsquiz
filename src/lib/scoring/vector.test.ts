import { describe, expect, it } from "vitest";
import { cosine, nearDuplicates, normalizeToSum, type Vector } from "./vector";

describe("cosine", () => {
  it("is 1 for vectors pointing the same way, whatever their length", () => {
    expect(cosine({ 1: 2, 2: 4 }, { 1: 1, 2: 2 })).toBeCloseTo(1, 10);
  });
  it("is 0 for orthogonal and −1 for opposite vectors", () => {
    expect(cosine({ 1: 3 }, { 2: 5 })).toBe(0);
    expect(cosine({ 1: 3, 2: -1 }, { 1: -3, 2: 1 })).toBeCloseTo(-1, 10);
  });
  it("handles a hand-computed case", () => {
    // (3·1 + 4·0) / (5 · 1) = 0.6
    expect(cosine({ 1: 3, 2: 4 }, { 1: 1 })).toBeCloseTo(0.6, 10);
  });
  it("is null when either vector is all zero", () => {
    expect(cosine({}, { 1: 1 })).toBeNull();
    expect(cosine({ 1: 0 }, { 1: 1 })).toBeNull();
  });
});

describe("nearDuplicates", () => {
  const items: { name: string; weights: Vector }[] = [
    { name: "Forester", weights: { 1: 5, 2: 1 } },
    { name: "Park Ranger", weights: { 1: 4.8, 2: 1.2 } },
    { name: "Analyst", weights: { 2: 5 } },
    { name: "Empty", weights: {} },
    { name: "Forester twin", weights: { 1: 10, 2: 2 } },
  ];
  it("finds pairs above the threshold, most similar first", () => {
    const pairs = nearDuplicates(items).map((p) => [p.a.name, p.b.name]);
    expect(pairs).toEqual([
      ["Forester", "Forester twin"],
      ["Forester", "Park Ranger"],
      ["Park Ranger", "Forester twin"],
    ]);
  });
  it("respects the threshold and skips zero vectors", () => {
    expect(nearDuplicates(items, 0.9999).map((p) => p.b.name)).toEqual(["Forester twin"]);
    expect(nearDuplicates([items[3], items[3]])).toEqual([]);
  });
});

describe("normalizeToSum", () => {
  it("scales absolute values to sum to 10, keeping signs", () => {
    expect(normalizeToSum({ 1: 2, 2: -2, 3: 1 })).toEqual({ weights: { 1: 4, 2: -4, 3: 2 }, clamped: false });
  });
  it("rounds to 2 decimals", () => {
    const { weights } = normalizeToSum({ 1: 1, 2: 1, 3: 1 });
    expect(weights).toEqual({ 1: 3.33, 2: 3.33, 3: 3.33 });
  });
  it("holds weights within ±5 and reports it", () => {
    expect(normalizeToSum({ 1: 4, 2: 1 })).toEqual({ weights: { 1: 5, 2: 2 }, clamped: true });
  });
  it("leaves a zero vector alone", () => {
    expect(normalizeToSum({ 1: 0 })).toEqual({ weights: { 1: 0 }, clamped: false });
  });
});
