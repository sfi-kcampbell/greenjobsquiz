import { describe, expect, it } from "vitest";
import { reportTokenFor } from "@/lib/public/tokens";
import { codeDayValues, codeInput, codeStatus, normalizeCode } from "./quiz-code-rules";
import { suggestCode } from "./quiz-codes";

describe("quiz code rules", () => {
  it("normalizes and validates codes", () => {
    expect(normalizeCode(" mail-25 ")).toBe("MAIL25");
    expect(codeInput.safeParse({ code: "ab", label: "", opensOn: "", closesOn: "" }).success).toBe(false);
    expect(codeInput.safeParse({ code: "Ms Lee 3!", label: "", opensOn: "", closesOn: "" }).success).toBe(false);
    const ok = codeInput.parse({ code: "mail 25", label: " Spring ", opensOn: "2026-03-01", closesOn: "2026-03-31" });
    expect(ok).toMatchObject({ code: "MAIL25", label: "Spring" });
    expect(ok.opensOn?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(ok.closesOn?.toISOString()).toBe("2026-04-01T00:00:00.000Z"); // the whole of the 31st
    expect(codeDayValues({ opensAt: ok.opensOn, closesAt: ok.closesOn })).toEqual({ opensOn: "2026-03-01", closesOn: "2026-03-31" });
    expect(codeInput.safeParse({ code: "MAIL25", label: "", opensOn: "2026-03-02", closesOn: "2026-03-01" }).success).toBe(false);
    expect(codeInput.safeParse({ code: "MAIL25", label: "", opensOn: "2026-03-01", closesOn: "2026-03-01" }).success).toBe(true);
  });

  it("suggests readable codes", () => {
    for (let i = 0; i < 20; i++) expect(suggestCode()).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
  });

  it("works out open, scheduled, closed and archived", () => {
    const now = new Date("2026-03-15T12:00:00Z");
    const base = { opensAt: null, closesAt: null, archivedAt: null };
    expect(codeStatus(base, now)).toBe("open");
    expect(codeStatus({ ...base, opensAt: new Date("2026-03-16T00:00:00Z") }, now)).toBe("scheduled");
    expect(codeStatus({ ...base, closesAt: new Date("2026-03-15T00:00:00Z") }, now)).toBe("closed");
    expect(codeStatus({ ...base, archivedAt: now }, now)).toBe("archived");
  });

  it("derives a stable teacher token that changes with the salt", () => {
    expect(reportTokenFor(1, "a")).toBe(reportTokenFor(1, "a"));
    expect(reportTokenFor(1, "a")).toMatch(/^[a-f0-9]{32}$/);
    expect(reportTokenFor(1, "b")).not.toBe(reportTokenFor(1, "a"));
    expect(reportTokenFor(2, "a")).not.toBe(reportTokenFor(1, "a"));
  });
});
