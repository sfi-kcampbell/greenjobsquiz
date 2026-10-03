import { describe, expect, it } from "vitest";
import {
  categoryInput,
  deriveAbbr,
  uniqueAbbr,
  fieldErrors,
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
