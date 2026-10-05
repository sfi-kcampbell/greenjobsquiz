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
  /** Shown above the Start button. Omitted (undefined) leaves it unchanged. */
  introHtml: z.string().max(20_000, "The introduction is too long.").optional(),
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

/** Like fieldErrors, but keyed by the full path ("answers.2.label") for nested forms. */
export function pathErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "form";
    out[key] ??= issue.message;
  }
  return out;
}

/** Flattens Zod issues into `{ field: firstMessage }` for inline form errors. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

/* ------------------------------- Questions ------------------------------ */

export const MAX_QUESTIONS = 100;
export const MAX_ANSWERS = 12;
export const WEIGHT_MIN = -5;
export const WEIGHT_MAX = 5;
const RICH_TEXT_MAX = 20_000;

const richText = z
  .string()
  .max(RICH_TEXT_MAX, "This text is too long.")
  .nullable()
  .optional()
  .transform((v) => v ?? null);

const weight = z.coerce
  .number({ error: `Weights must be numbers from ${WEIGHT_MIN} to ${WEIGHT_MAX}.` })
  .min(WEIGHT_MIN, `Weights can't be below ${WEIGHT_MIN}.`)
  .max(WEIGHT_MAX, `Weights can't be above ${WEIGHT_MAX}.`)
  .transform((n) => Math.round(n * 100) / 100);

export const answerInput = z.object({
  /** Client-side key, echoed back so new rows learn their database id. */
  key: z.string().min(1).max(64),
  id: z.coerce.number().int().positive().nullable(),
  label: z.string().trim().min(1, "Every answer needs a label.").max(200, "Keep answer labels under 200 characters."),
  bodyHtml: richText,
  /** categoryId → weight. Zeros are allowed here and dropped when saving. */
  weights: z.record(z.string().regex(/^\d+$/), weight),
});
export type AnswerInput = z.infer<typeof answerInput>;

export const questionInput = z
  .object({
    id: z.coerce.number().int().positive().nullable(),
    title: z.string().trim().min(1, "Enter the question.").max(300, "Keep the question under 300 characters."),
    helpHtml: richText,
    type: z.enum(["single", "multi"]),
    required: z.boolean(),
    splitMulti: z.boolean(),
    minSelect: z.coerce.number().int(),
    maxSelect: z.coerce.number().int(),
    answers: z.array(answerInput).max(MAX_ANSWERS, `A question can have at most ${MAX_ANSWERS} answers.`),
  })
  .transform((q) =>
    q.type === "single" ? { ...q, minSelect: 1, maxSelect: 1, splitMulti: false } : q,
  )
  .superRefine((q, ctx) => {
    const keys = new Set(q.answers.map((a) => a.key));
    if (keys.size !== q.answers.length) {
      ctx.addIssue({ code: "custom", path: ["answers"], message: "Duplicate answer rows." });
    }
    if (q.type !== "multi") return;
    if (q.minSelect < 1) {
      ctx.addIssue({ code: "custom", path: ["minSelect"], message: "Minimum must be at least 1." });
    }
    if (q.maxSelect < q.minSelect) {
      ctx.addIssue({ code: "custom", path: ["maxSelect"], message: "Maximum can't be less than the minimum." });
    }
    if (q.answers.length > 0 && q.maxSelect > q.answers.length) {
      ctx.addIssue({
        code: "custom",
        path: ["maxSelect"],
        message: `Maximum can't be more than the number of answers (${q.answers.length}).`,
      });
    }
  });
export type QuestionInput = z.infer<typeof questionInput>;

/* ------------------------------- Responses ------------------------------ */

export const MAX_RESPONSES = 50;

const responseWeights = z.record(z.string().regex(/^\d+$/), weight);

export const responseRowInput = z.object({
  id: z.coerce.number().int().positive().nullable(),
  title: z.string().trim().min(1, "Enter a title.").max(120, "Keep the title under 120 characters."),
  weights: responseWeights,
});
export type ResponseRowInput = z.infer<typeof responseRowInput>;

export const responseDetailsInput = z
  .object({
    title: z.string().trim().min(1, "Enter a title.").max(120, "Keep the title under 120 characters."),
    excerpt: z
      .string()
      .trim()
      .max(300, "Keep the summary under 300 characters.")
      .transform((v) => v || null),
    bodyHtml: richText,
    ctaUrl: z
      .string()
      .trim()
      .max(2000)
      .transform((v) => v || null)
      .refine((v) => v === null || /^https?:\/\/[^\s]+$/i.test(v), "Enter a full web address starting with https://"),
    ctaLabel: z
      .string()
      .trim()
      .max(60, "Keep the button label under 60 characters.")
      .transform((v) => v || null),
    weights: responseWeights,
  })
  .superRefine((r, ctx) => {
    if (r.ctaUrl && !r.ctaLabel) {
      ctx.addIssue({ code: "custom", path: ["ctaLabel"], message: "Add a button label for the link." });
    }
    if (r.ctaLabel && !r.ctaUrl) {
      ctx.addIssue({ code: "custom", path: ["ctaUrl"], message: "Add the web address the button links to." });
    }
  });
export type ResponseDetailsInput = z.infer<typeof responseDetailsInput>;

/* ------------------------------ Quiz scoring ---------------------------- */

export const quizScoringInput = z.object({
  runnersUpCount: z.coerce.number().int().min(0, "Use 0 to 5.").max(5, "Use 0 to 5."),
  normalizePerCategory: z.boolean(),
  defaultResultId: z.coerce
    .number()
    .int()
    .positive()
    .nullable()
    .catch(null),
});
export type QuizScoringInput = z.infer<typeof quizScoringInput>;
