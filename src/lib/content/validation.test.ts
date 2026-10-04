import { describe, expect, it } from "vitest";
import {
  categoryInput,
  deriveAbbr,
  uniqueAbbr,
  fieldErrors,
  questionInput,
  quizInput,
  slugify,
  SUGGESTED_CATEGORIES,
} from "./validation";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Green Jobs: Which Fits You?")).toBe("green-jobs-which-fits-you");
  });
  it("strips accents and handles ampersands", () => {
    expect(slugify("Café & Forêt")).toBe("cafe-and-foret");
  });
  it("trims stray hyphens and caps length at 80", () => {
    expect(slugify("  --Hello--  ")).toBe("hello");
    const long = slugify("word ".repeat(40));
    expect(long.length).toBeLessThanOrEqual(80);
    expect(long.endsWith("-")).toBe(false);
  });
  it("returns empty for symbols only", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("deriveAbbr", () => {
  it("takes the first four letters, uppercased", () => {
    expect(deriveAbbr("Outdoors")).toBe("OUTD");
    expect(deriveAbbr("Policy & Advocacy")).toBe("POLI");
    expect(deriveAbbr("Hands-on")).toBe("HAND");
    expect(deriveAbbr("A1 b")).toBe("A1B");
    expect(deriveAbbr("")).toBe("");
  });
});

describe("uniqueAbbr", () => {
  it("returns the plain abbreviation when free", () => {
    expect(uniqueAbbr("Outdoors", ["ANLY"])).toBe("OUTD");
  });
  it("adds a number when taken, case-insensitively, within 6 characters", () => {
    expect(uniqueAbbr("Extra 2", ["extr"])).toBe("EXTR2");
    expect(uniqueAbbr("Extra 3", ["EXTR", "EXTR2"])).toBe("EXTR3");
    const taken = ["EXTR", ...Array.from({ length: 98 }, (_, i) => `EXTR${i + 2}`)];
    expect(uniqueAbbr("Extra", taken)).toBe("EXT100");
  });
  it("leaves an empty name empty", () => {
    expect(uniqueAbbr("", [""])).toBe("");
  });
});

describe("quizInput", () => {
  it("accepts a valid quiz and normalizes the slug", () => {
    expect(quizInput.parse({ title: " Green Jobs ", slug: "Green-Jobs" })).toEqual({
      title: "Green Jobs",
      slug: "green-jobs",
    });
  });
  it("rejects bad slugs", () => {
    for (const slug of ["", "has space", "double--hyphen", "-lead", "trail-", "under_score"]) {
      expect(quizInput.safeParse({ title: "T", slug }).success, slug).toBe(false);
    }
  });
});

describe("categoryInput", () => {
  const ok = { name: "Outdoors", abbr: "OUTD", color: "#3F7D4E", importance: "1.257" };

  it("parses and normalizes", () => {
    expect(categoryInput.parse(ok)).toEqual({
      name: "Outdoors",
      abbr: "OUTD",
      color: "#3f7d4e",
      importance: 1.26,
    });
  });
  it("enforces limits", () => {
    const bad = categoryInput.safeParse({ ...ok, name: "", abbr: "TOOLONG", color: "red", importance: 6 });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(Object.keys(fieldErrors(bad.error)).sort()).toEqual(["abbr", "color", "importance", "name"]);
    }
    expect(categoryInput.safeParse({ ...ok, importance: -0.5 }).success).toBe(false);
    expect(categoryInput.safeParse({ ...ok, importance: "abc" }).success).toBe(false);
  });
});

describe("SUGGESTED_CATEGORIES", () => {
  it("has six valid entries with unique names and abbreviations", () => {
    expect(SUGGESTED_CATEGORIES).toHaveLength(6);
    for (const c of SUGGESTED_CATEGORIES) expect(categoryInput.safeParse(c).success).toBe(true);
    expect(new Set(SUGGESTED_CATEGORIES.map((c) => c.name.toLowerCase())).size).toBe(6);
    expect(new Set(SUGGESTED_CATEGORIES.map((c) => c.abbr.toLowerCase())).size).toBe(6);
  });
});

describe("questionInput", () => {
  const answer = (key: string, weights: Record<string, number | string> = {}) => ({
    key,
    id: null,
    label: `Answer ${key}`,
    bodyHtml: null,
    weights,
  });
  const base = {
    id: null,
    title: "How do you feel about rain?",
    helpHtml: null,
    type: "single" as const,
    required: true,
    splitMulti: true,
    minSelect: 3,
    maxSelect: 4,
    answers: [answer("a"), answer("b")],
  };

  it("forces single questions to choose exactly one", () => {
    const q = questionInput.parse(base);
    expect([q.minSelect, q.maxSelect, q.splitMulti]).toEqual([1, 1, false]);
  });

  it("checks multi-select bounds", () => {
    const multi = { ...base, type: "multi" as const, answers: [answer("a"), answer("b"), answer("c")] };
    expect(questionInput.safeParse({ ...multi, minSelect: 1, maxSelect: 3 }).success).toBe(true);
    const errs = (v: object) => {
      const r = questionInput.safeParse({ ...multi, ...v });
      return r.success ? {} : fieldErrors(r.error);
    };
    expect(errs({ minSelect: 0, maxSelect: 2 })).toHaveProperty("minSelect");
    expect(errs({ minSelect: 2, maxSelect: 1 })).toHaveProperty("maxSelect");
    expect(errs({ minSelect: 1, maxSelect: 4 }).maxSelect).toMatch(/number of answers \(3\)/);
  });

  it("validates and rounds weights", () => {
    const q = questionInput.parse({ ...base, answers: [answer("a", { "3": "2.345", "4": -5 })] });
    expect(q.answers[0].weights).toEqual({ "3": 2.35, "4": -5 });
    expect(questionInput.safeParse({ ...base, answers: [answer("a", { "3": 6 })] }).success).toBe(false);
    expect(questionInput.safeParse({ ...base, answers: [answer("a", { "3": "x" })] }).success).toBe(false);
    expect(questionInput.safeParse({ ...base, answers: [answer("a", { cat: 1 })] }).success).toBe(false);
  });

  it("requires labels and limits answer count", () => {
    expect(questionInput.safeParse({ ...base, answers: [{ ...answer("a"), label: "  " }] }).success).toBe(false);
    const many = Array.from({ length: 13 }, (_, i) => answer(String(i)));
    expect(questionInput.safeParse({ ...base, answers: many }).success).toBe(false);
    expect(questionInput.safeParse({ ...base, answers: [answer("a"), answer("a")] }).success).toBe(false);
  });
});
