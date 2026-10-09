/**
 * Quiz codes: pure rules shared by the server, the admin form and tests.
 * Codes are case-insensitive (stored upper case) and easy to type.
 */
import { z } from "zod";

export const CODE_PATTERN = /^[A-Z0-9]{4,20}$/;
/** A teacher summary appears once this many people have finished (so no one is identifiable). */
export const REPORT_MIN_FINISHED = 5;

export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "");
}

export type CodeStatus = "open" | "scheduled" | "closed" | "archived";

export function codeStatus(
  code: { opensAt: Date | null; closesAt: Date | null; archivedAt: Date | null },
  now = new Date(),
): CodeStatus {
  if (code.archivedAt) return "archived";
  if (code.opensAt && now < code.opensAt) return "scheduled";
  if (code.closesAt && now >= code.closesAt) return "closed";
  return "open";
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayStart = (d: string) => new Date(`${d}T00:00:00Z`);

/** Dates are whole UTC days: open from the start of `opensOn`, closed after the end of `closesOn`. */
export const codeDatesInput = z
  .object({
    label: z
      .string()
      .trim()
      .max(120, "Keep the label under 120 characters.")
      .transform((v) => v || null),
    opensOn: z
      .string()
      .trim()
      .refine((v) => !v || DAY.test(v), "Pick a date.")
      .transform((v) => (v ? dayStart(v) : null)),
    closesOn: z
      .string()
      .trim()
      .refine((v) => !v || DAY.test(v), "Pick a date.")
      .transform((v) => (v ? new Date(dayStart(v).getTime() + 86_400_000) : null)),
  })
  .superRefine((c, ctx) => {
    if (c.opensOn && c.closesOn && c.closesOn <= c.opensOn) {
      ctx.addIssue({ code: "custom", path: ["closesOn"], message: "The closing date must be on or after the opening date." });
    }
  });

export const codeInput = z
  .object({
    code: z
      .string()
      .transform(normalizeCode)
      .refine((v) => CODE_PATTERN.test(v), "Use 4 to 20 letters and numbers."),
  })
  .and(codeDatesInput);
export type CodeInput = z.infer<typeof codeInput>;

/** For the date inputs: the stored instants back to YYYY-MM-DD (closes is exclusive). */
export function codeDayValues(code: { opensAt: Date | null; closesAt: Date | null }) {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  return {
    opensOn: code.opensAt ? day(code.opensAt) : "",
    closesOn: code.closesAt ? day(new Date(code.closesAt.getTime() - 86_400_000)) : "",
  };
}
