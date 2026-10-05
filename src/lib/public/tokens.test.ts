import { describe, expect, it } from "vitest";
import { hashToken, isToken, missingPublicConfig, newToken, shareTokenFor } from "./tokens";

describe("tokens", () => {
  it("makes 64-hex tokens that are unique", () => {
    const a = newToken();
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(newToken()).not.toBe(a);
    expect(isToken(a)).toBe(true);
  });

  it("hashes deterministically, never returning the token itself", () => {
    const t = newToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashToken(t)).not.toBe(t);
    expect(hashToken(newToken())).not.toBe(hashToken(t));
  });

  it("derives a stable 32-hex share token per session and submission", () => {
    const h = hashToken(newToken());
    expect(shareTokenFor(h, 7)).toBe(shareTokenFor(h, 7));
    expect(shareTokenFor(h, 7)).toMatch(/^[a-f0-9]{32}$/);
    expect(shareTokenFor(h, 8)).not.toBe(shareTokenFor(h, 7));
  });

  it("validates token shape", () => {
    for (const bad of ["", "abc", "Z".repeat(64), "a".repeat(65), 42, null, "a".repeat(31)]) {
      expect(isToken(bad)).toBe(false);
    }
    expect(isToken("a".repeat(32))).toBe(true);
  });
});

describe("missingPublicConfig", () => {
  it("flags a missing pepper in production only", () => {
    expect(missingPublicConfig({ NODE_ENV: "production" })).toEqual(["TOKEN_PEPPER"]);
    expect(missingPublicConfig({ NODE_ENV: "production", TOKEN_PEPPER: "x".repeat(64) })).toEqual([]);
    expect(missingPublicConfig({ NODE_ENV: "development" })).toEqual([]);
  });
});
