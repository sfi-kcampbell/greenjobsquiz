/**
 * Input schemas and pure helpers for authored content. No I/O, so these are
 * shared by server actions, client components and tests.
 */
import { z } from "zod";

/* ------------------------------- Quizzes -------------------------------- */

export const SLUG_MAX = 80;
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** "Green Jobs: Which fits?" → "green-jobs-which-fits" */
export function slugify(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
}

export const quizInput = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(120, "Keep the title under 120 characters."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Enter a URL slug.")
    .max(SLUG_MAX, `Keep the slug under ${SLUG_MAX} characters.`)
    .regex(SLUG_PATTERN, "Use lowercase letters, numbers and single hyphens only."),
});
export type QuizInput = z.infer<typeof quizInput>;

/* ------------------------------ Categories ------------------------------ */

export const MAX_CATEGORIES = 15;
export const WARN_CATEGORIES = 8;
export const ABBR_MAX = 6;

/** First four letters or digits, uppercased: "Policy & Advocacy" → "POLI". */
export function deriveAbbr(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]/g, "")
    .slice(0, 4)
    .toUpperCase();
}

/**
 * deriveAbbr, made unique against abbreviations already in use (case-insensitive):
 * "Extra 2" next to an existing EXTR becomes EXTR2.
 */
export function uniqueAbbr(name: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((a) => a.toLowerCase()));
  const base = deriveAbbr(name);
  if (!base || !used.has(base.toLowerCase())) return base;
  for (let n = 2; n < 1000; n++) {
    const suffix = String(n);
    const candidate = base.slice(0, ABBR_MAX - suffix.length) + suffix;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return base;
}

export const categoryInput = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(60, "Keep the name under 60 characters."),
  abbr: z
    .string()
    .trim()
    .min(1, "Enter an abbreviation.")
    .max(ABBR_MAX, `Use at most ${ABBR_MAX} characters.`),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Pick a color.")
    .transform((c) => c.toLowerCase()),
  importance: z.coerce
    .number({ error: "Enter a number from 0 to 5." })
    .min(0, "Importance can't be below 0.")
    .max(5, "Importance can't be above 5.")
    .transform((n) => Math.round(n * 100) / 100),
});
export type CategoryInput = z.infer<typeof categoryInput>;

/** Seeded by "Start with a suggested set". */
export const SUGGESTED_CATEGORIES: readonly CategoryInput[] = [
  { name: "Outdoors", abbr: "OUTD", color: "#3f7d4e", importance: 1 },
  { name: "Analytical", abbr: "ANLY", color: "#2f6690", importance: 1 },
  { name: "People-facing", abbr: "PEOP", color: "#c2652a", importance: 1 },
  { name: "Hands-on", abbr: "HAND", color: "#8a6a2f", importance: 1 },
  { name: "Creative", abbr: "CREA", color: "#8e4f9e", importance: 1 },
  { name: "Policy & Advocacy", abbr: "POLI", color: "#a8394d", importance: 1 },
];

/** Colors offered to new categories, in order. */
export const CATEGORY_PALETTE = [
  "#3f7d4e",
  "#2f6690",
  "#c2652a",
  "#8a6a2f",
  "#8e4f9e",
  "#a8394d",
  "#2a8c8c",
  "#5c6b2e",
] as const;

/** Flattens Zod issues into `{ field: firstMessage }` for inline form errors. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
