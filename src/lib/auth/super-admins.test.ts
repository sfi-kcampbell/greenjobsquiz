import { describe, expect, it } from "vitest";
import { isSuperAdminEmail, listSuperAdmins, normalizeEmail, parseEmailList } from "./super-admins";

describe("parseEmailList", () => {
  it("splits, trims and lowercases", () => {
    expect([...parseEmailList(" A@Example.org, b@example.org ,C@EXAMPLE.ORG")]).toEqual([
      "a@example.org",
      "b@example.org",
      "c@example.org",
    ]);
  });

  it("ignores blanks, duplicates and junk", () => {
    expect([...parseEmailList("a@x.org,,  , not-an-email, a@x.org, b @x.org")]).toEqual(["a@x.org"]);
  });

  it("handles missing values", () => {
    expect(parseEmailList(undefined).size).toBe(0);
    expect(parseEmailList(null).size).toBe(0);
    expect(parseEmailList("").size).toBe(0);
  });
});

describe("isSuperAdminEmail", () => {
  const env = "kcampbell@wolfstrata.com, Boss@Example.org";

  it("matches case-insensitively and ignores surrounding space", () => {
    expect(isSuperAdminEmail("KCampbell@WolfStrata.com", env)).toBe(true);
    expect(isSuperAdminEmail("  boss@example.org ", env)).toBe(true);
  });

  it("rejects everyone else", () => {
    expect(isSuperAdminEmail("someone@example.org", env)).toBe(false);
    expect(isSuperAdminEmail("boss@example.org.evil.com", env)).toBe(false);
    expect(isSuperAdminEmail(null, env)).toBe(false);
    expect(isSuperAdminEmail("", env)).toBe(false);
  });

  it("grants nobody when SUPER_ADMINS is unset", () => {
    expect(isSuperAdminEmail("kcampbell@wolfstrata.com", undefined)).toBe(false);
  });
});

describe("listSuperAdmins", () => {
  it("returns a sorted list", () => {
    expect(listSuperAdmins("z@x.org,a@x.org")).toEqual(["a@x.org", "z@x.org"]);
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Mixed@Case.ORG ")).toBe("mixed@case.org");
  });
});
