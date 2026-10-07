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

/* --------------------------- Respondent options ------------------------- */

export const quizRespondentInput = z.object({
  showProgress: z.boolean(),
  autoAdvance: z.boolean(),
  retakeAllowed: z.boolean(),
});
export type QuizRespondentInput = z.infer<typeof quizRespondentInput>;

/* -------------------------------- Delivery ------------------------------ */

/** https, or http on localhost (development). */
const isWebUrl = (v: string) => {
  try {
    const u = new URL(v);
    return u.protocol === "https:" || (u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname));
  } catch {
    return false;
  }
};

export const quizDeliveryInput = z
  .object({
    layout: z.enum(["stepped", "single_page"]),
    layoutTemplate: z.enum(["default", "canvas"]),
    deliveryMode: z.enum(["hosted", "headless"]),
    headlessBaseUrl: z
      .string()
      .trim()
      .max(500)
      .transform((v) => v.replace(/\/+$/, "") || null),
  })
  .superRefine((d, ctx) => {
    if (d.deliveryMode !== "headless") return; // the address is only checked when it's used
    if (!d.headlessBaseUrl) {
      ctx.addIssue({ code: "custom", path: ["headlessBaseUrl"], message: "Headless delivery needs the address of your front end." });
    } else if (!isWebUrl(d.headlessBaseUrl)) {
      ctx.addIssue({ code: "custom", path: ["headlessBaseUrl"], message: "Enter a full web address starting with https://" });
    }
  })
  // A leftover, unchecked address is dropped when hosted.
  .transform((d) => (d.deliveryMode === "hosted" && d.headlessBaseUrl && !isWebUrl(d.headlessBaseUrl) ? { ...d, headlessBaseUrl: null } : d));
export type QuizDeliveryInput = z.infer<typeof quizDeliveryInput>;

/** "https://Example.org/" → "https://example.org". Null if it isn't a bare origin. */
export function normalizeOrigin(value: string): string | null {
  const v = value.trim();
  if (!isWebUrl(v)) return null;
  const u = new URL(v);
  if ((u.pathname !== "/" && u.pathname !== "") || u.search || u.hash || u.username) return null;
  if (!/^https?:\/\/[^/]+\/?$/i.test(v)) return null;
  return u.origin.toLowerCase();
}

/** One origin per line; blank lines ignored; duplicates removed. */
export const originList = z.string().transform((text, ctx) => {
  const out: string[] = [];
  for (const [i, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const origin = normalizeOrigin(line);
    if (!origin) {
      ctx.addIssue({ code: "custom", message: `Line ${i + 1}: “${line.trim()}” isn't a site address like https://example.org (no path).` });
      continue;
    }
    if (!out.includes(origin)) out.push(origin);
  }
  if (out.length > 50) ctx.addIssue({ code: "custom", message: "Keep it to 50 sites or fewer." });
  return out;
});

export const accessSettingsInput = z.object({
  embedOrigins: originList,
  corsOrigins: originList,
});
export type AccessSettingsInput = z.infer<typeof accessSettingsInput>;

/* --------------------------------- Banner -------------------------------- */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const quizBannerInput = z.object({
  /** null removes the banner. */
  mediaId: z
    .string()
    .trim()
    .transform((v) => v || null)
    .refine((v) => v === null || UUID.test(v), "Upload the banner image again."),
  /** Empty means decorative. */
  alt: z.string().trim().max(300, "Keep the description under 300 characters."),
});
export type QuizBannerInput = z.infer<typeof quizBannerInput>;

/* ------------------------------- Custom CSS ------------------------------ */

export const CSS_MAX = 50_000;

/**
 * Why a stylesheet can't be used, or null. The CSS goes inside a <style>
 * element on public pages, so "<" is refused (no way to close the element and
 * inject HTML); it may not load anything from other sites (@import, outside
 * url()), so it can't pull in code or leak visitors' addresses.
 */
export function cssProblem(raw: string): string | null {
  const lt = raw.indexOf("<");
  if (lt >= 0) return `Line ${lineOf(raw, lt)}: CSS can't contain "<".`;
  // Check the CSS as the browser reads it, so escapes (u\72l, @\69mport) can't hide anything.
  const css = unescapeCss(raw);
  const importAt = css.search(/@import\b/i);
  if (importAt >= 0) return `Line ${lineOf(css, importAt)}: @import isn't allowed. Put the rules here instead.`;
  for (const m of css.matchAll(/(expression\s*\(|javascript\s*:|behavior\s*:|-moz-binding)/gi)) {
    return `Line ${lineOf(css, m.index ?? 0)}: "${m[1]}" isn't allowed.`;
  }
  for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi)) {
    if (!localOrData(m[2])) {
      return `Line ${lineOf(css, m.index ?? 0)}: url(${m[2].trim()}) points outside this site. Use an uploaded image (/media/…) or a data: URL.`;
    }
  }
  // image-set("…") and friends take plain strings as addresses too.
  for (const m of css.matchAll(/(['"])\s*((?:[a-z][a-z0-9+.-]*:)?\/\/[^'"]*)\1/gi)) {
    if (!localOrData(m[2])) {
      return `Line ${lineOf(css, m.index ?? 0)}: "${m[2].trim()}" looks like an address outside this site, which isn't allowed.`;
    }
  }
  return null;
}

const lineOf = (text: string, index: number) => text.slice(0, index).split("\n").length;

const localOrData = (target: string) => {
  const t = target.trim();
  return (t.startsWith("/") && !t.startsWith("//")) || /^data:/i.test(t) || !/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(t);
};

/** Resolves CSS escapes (\75 or \u) to the characters they stand for. */
function unescapeCss(css: string): string {
  return css.replace(/\\(?:([0-9a-f]{1,6})[ \t\n]?|([^\n0-9a-f]))/gi, (_, hex: string | undefined, ch: string | undefined) =>
    hex ? String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff) || 0xfffd) : (ch ?? ""),
  );
}

export const customCssInput = z
  .string()
  .max(CSS_MAX, `Keep the CSS under ${CSS_MAX.toLocaleString("en")} characters.`)
  .transform((css) => css.replace(/\r\n/g, "\n"))
  .superRefine((css, ctx) => {
    const problem = cssProblem(css);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  });
