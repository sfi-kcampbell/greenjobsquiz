/**
 * The public shape of a published quiz. NEVER includes weights, categories
 * or anything else that would reveal how answers are scored: shipping the
 * scoring key would turn the quiz into a lookup table.
 */
import { and, asc, eq } from "drizzle-orm";
import { listQuestions } from "@/lib/content/questions";
import type { Executor } from "@/lib/db/create";
import { quizzes } from "@/lib/db/schema";
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
  answers: PublicAnswer[];
};
export type PublicQuiz = {
  id: number;
  slug: string;
  title: string;
  introHtml: string | null;
  layout: "stepped" | "single_page";
  settings: {
    allowSkip: boolean;
    showProgress: boolean;
    retakeAllowed: boolean;
    autoAdvance: boolean;
    runnersUpCount: number;
  };
  structureVersion: number;
  questions: PublicQuestion[];
};

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
};

/** What the hosted and embed pages need: the public quiz plus how it's delivered. */
export async function getPublishedQuizPage(db: Executor, slug: string): Promise<QuizPageInfo | null> {
  const quiz = await getPublishedQuiz(db, { slug });
  if (!quiz) return null;
  const [row] = await db
    .select({ deliveryMode: quizzes.deliveryMode, headlessBaseUrl: quizzes.headlessBaseUrl, layoutTemplate: quizzes.layoutTemplate })
    .from(quizzes)
    .where(eq(quizzes.id, quiz.id))
    .limit(1);
  return { quiz, ...row };
}

/** Only published quizzes; drafts look exactly like missing ones. */
export async function getPublishedQuiz(db: Executor, ref: { id: number } | { slug: string }): Promise<PublicQuiz | null> {
  const where = "id" in ref ? eq(quizzes.id, ref.id) : eq(quizzes.slug, ref.slug);
  const [quiz] = await db
    .select()
    .from(quizzes)
    .where(and(where, eq(quizzes.status, "published")))
    .limit(1);
  if (!quiz) return null;

  const questions = await listQuestions(db, quiz.id);
  return {
    id: quiz.id,
    slug: quiz.slug,
    title: quiz.title,
    introHtml: sanitizeRichText(quiz.introHtml, PUBLIC),
    layout: quiz.layout,
    settings: {
      allowSkip: quiz.allowSkip,
      showProgress: quiz.showProgress,
      retakeAllowed: quiz.retakeAllowed,
      autoAdvance: quiz.autoAdvance,
      runnersUpCount: quiz.runnersUpCount,
    },
    structureVersion: quiz.structureVersion,
    // Explicit field picks: weights are dropped here and must never be added.
    questions: questions.map((q) => ({
      id: q.id,
      title: q.title,
      helpHtml: sanitizeRichText(q.helpHtml, PUBLIC),
      type: q.type,
      minSelect: q.minSelect,
      maxSelect: q.maxSelect,
      required: q.required,
      answers: q.answers.map((a) => ({ id: a.id, label: a.label, bodyHtml: sanitizeRichText(a.bodyHtml, PUBLIC) })),
    })),
  };
}
