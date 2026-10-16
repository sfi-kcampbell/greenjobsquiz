/**
 * The public shape of a published quiz. NEVER includes weights, categories
 * or anything else that would reveal how answers are scored: shipping the
 * scoring key would turn the quiz into a lookup table.
 */
import { and, asc, eq } from "drizzle-orm";
import { getVersion, getVersionById, latestVersion, type VersionRow } from "@/lib/content/versions";
import type { Executor } from "@/lib/db/create";
import { localizeContent } from "@/lib/content/localize";
import { media, quizzes } from "@/lib/db/schema";
import { offeredLocales, pickLocale, type Locale } from "@/lib/i18n/locales";
import { sanitizeRichText } from "@/lib/sanitize/rich-text";

/** Off-site links in what respondents see open in a new tab. */
const PUBLIC = { external: true } as const;

export type PublicAnswer = { id: number; label: string; bodyHtml: string | null };
export type PublicQuestion = {
  id: number;
  title: string;
  helpHtml: string | null;
  type: "single" | "multi";
  minSelect: number;
  maxSelect: number;
  required: boolean;
  /** "pre": asked before the scored questions (not scored); "scored"; "post": a follow-up under the result. */
  part: "pre" | "scored" | "post";
  answers: PublicAnswer[];
};
export type PublicBanner = { url: string; alt: string; width: number; height: number };

export type PublicQuiz = {
  id: number;
  slug: string;
  title: string;
  introHtml: string | null;
  /** Image for the top of the quiz (relative URL here; the API makes it absolute). */
  banner: PublicBanner | null;
  layout: "stepped" | "single_page";
  settings: {
    allowSkip: boolean;
    showProgress: boolean;
    retakeAllowed: boolean;
    autoAdvance: boolean;
    runnersUpCount: number;
    /** New attempts need a quiz code (from the link, or typed in). */
    requireCode: boolean;
  };
  /** The published version these questions come from. */
  version: number;
  /** Same as `version` (kept for older clients). */
  structureVersion: number;
  /** In the order asked: "before the quiz" questions, then the scored ones. */
  questions: PublicQuestion[];
  /** Follow-up questions, shown under the result (never scored). */
  followUp: PublicQuestion[];
  /** The language this copy is in (untranslated text falls back to English). */
  locale: Locale;
  /** The languages the quiz offers, English first. */
  languages: Locale[];
};

/** Which language to serve: `locale` (?lang=) if offered, else the browser's, else English. */
export type LocaleRequest = { locale?: string | null; acceptLanguage?: string | null };

/** Published quizzes (the API lists all; pages pass `hostedOnly` to skip headless ones). */
export async function listPublishedQuizzes(db: Executor, opts: { hostedOnly?: boolean } = {}) {
  return db
    .select({ id: quizzes.id, slug: quizzes.slug, title: quizzes.title })
    .from(quizzes)
    .where(and(eq(quizzes.status, "published"), opts.hostedOnly ? eq(quizzes.deliveryMode, "hosted") : undefined))
    .orderBy(asc(quizzes.title));
}

export type QuizPageInfo = {
  quiz: PublicQuiz;
  deliveryMode: "hosted" | "headless";
  headlessBaseUrl: string | null;
  layoutTemplate: "default" | "canvas";
  /** The quiz's own CSS (pages put it after the site-wide CSS). */
  customCss: string;
};

async function bannerFor(db: Executor, mediaId: string | null, alt: string | null): Promise<PublicBanner | null> {
  if (!mediaId) return null;
  const [m] = await db.select({ width: media.width, height: media.height }).from(media).where(eq(media.id, mediaId)).limit(1);
  return m ? { url: `/media/${mediaId}`, alt: alt ?? "", width: m.width, height: m.height } : null;
}

/** Banner and CSS for a quiz, published or not (the shared result page outlives publishing). */
export async function getQuizBranding(db: Executor, quizId: number): Promise<{ banner: PublicBanner | null; customCss: string }> {
  const [q] = await db
    .select({ bannerMediaId: quizzes.bannerMediaId, bannerAlt: quizzes.bannerAlt, customCss: quizzes.customCss })
    .from(quizzes)
    .where(eq(quizzes.id, quizId))
    .limit(1);
  if (!q) return { banner: null, customCss: "" };
  return { banner: await bannerFor(db, q.bannerMediaId, q.bannerAlt), customCss: q.customCss };
}

/** What the hosted and embed pages need: the public quiz plus how it's delivered. */
export async function getPublishedQuizPage(db: Executor, slug: string, locale?: string | null): Promise<QuizPageInfo | null> {
  const quiz = await getPublishedQuiz(db, { slug }, { locale });
  if (!quiz) return null;
  const [row] = await db
    .select({
      deliveryMode: quizzes.deliveryMode,
      headlessBaseUrl: quizzes.headlessBaseUrl,
      layoutTemplate: quizzes.layoutTemplate,
      customCss: quizzes.customCss,
    })
    .from(quizzes)
    .where(eq(quizzes.id, quiz.id))
    .limit(1);
  return { quiz, ...row };
}

type QuizRow = typeof quizzes.$inferSelect;

function toPublicQuestion(q: VersionRow["content"]["questions"][number]): PublicQuestion {
  return {
    id: q.id,
    title: q.title,
    helpHtml: sanitizeRichText(q.helpHtml, PUBLIC),
    type: q.type,
    minSelect: q.minSelect,
    maxSelect: q.maxSelect,
    required: q.required,
    part: q.part,
    answers: q.answers.map((a) => ({ id: a.id, label: a.label, bodyHtml: sanitizeRichText(a.bodyHtml, PUBLIC) })),
  };
}

/**
 * A version's content plus the quiz's live settings (slug, banner, layout,
 * respondent options). Explicit field picks: weights are dropped here and
 * must never be added.
 */
async function publicFromVersion(db: Executor, quiz: QuizRow, version: VersionRow, want: LocaleRequest = {}): Promise<PublicQuiz> {
  const languages = offeredLocales(quiz.languages);
  const locale = pickLocale(want.locale, want.acceptLanguage, languages);
  const c = localizeContent(version.content, locale);
  const bannerAlt = (locale !== "en" && quiz.bannerAltTranslations?.[locale]) || quiz.bannerAlt;
  return {
    id: quiz.id,
    slug: quiz.slug,
    title: c.title,
    introHtml: sanitizeRichText(c.introHtml, PUBLIC),
    banner: await bannerFor(db, quiz.bannerMediaId, bannerAlt),
    layout: quiz.layout,
    settings: {
      allowSkip: quiz.allowSkip,
      showProgress: quiz.showProgress,
      retakeAllowed: quiz.retakeAllowed,
      autoAdvance: quiz.autoAdvance,
      runnersUpCount: c.scoring.runnersUpCount,
      requireCode: quiz.requireCode,
    },
    version: version.number,
    structureVersion: version.number,
    // "Before" questions first (stable within each part), then scored; follow-ups apart.
    questions: [...c.questions.filter((q) => q.part === "pre"), ...c.questions.filter((q) => q.part === "scored")].map(toPublicQuestion),
    followUp: c.questions.filter((q) => q.part === "post").map(toPublicQuestion),
    locale,
    languages,
  };
}

/**
 * Only published quizzes (drafts look exactly like missing ones), as their
 * latest published version, or `version` when given.
 */
export async function getPublishedQuiz(
  db: Executor,
  ref: { id: number } | { slug: string },
  opts: { version?: number } & LocaleRequest = {},
): Promise<PublicQuiz | null> {
  const where = "id" in ref ? eq(quizzes.id, ref.id) : eq(quizzes.slug, ref.slug);
  const [quiz] = await db
    .select()
    .from(quizzes)
    .where(and(where, eq(quizzes.status, "published")))
    .limit(1);
  if (!quiz) return null;
  const version = opts.version ? await getVersion(db, quiz.id, opts.version) : await latestVersion(db, quiz.id);
  return version ? publicFromVersion(db, quiz, version, opts) : null;
}

/** The quiz as of a particular version (for an attempt that started on it). */
export async function getPublishedQuizAtVersionId(
  db: Executor,
  quizId: number,
  versionId: number,
  want: LocaleRequest = {},
): Promise<PublicQuiz | null> {
  const version = await getVersionById(db, versionId);
  if (!version || version.quizId !== quizId) return null;
  const [quiz] = await db.select().from(quizzes).where(eq(quizzes.id, quizId)).limit(1);
  return quiz ? publicFromVersion(db, quiz, version, want) : null;
}
