import "server-only";
import { unstable_cache, updateTag } from "next/cache";
import { getSiteCss } from "@/lib/content/settings";
import { db } from "@/lib/db/client";
import { pickLocale } from "@/lib/i18n/locales";
import { getPublishedQuizPage, listPublishedQuizzes } from "./structure";

/**
 * Cached reads for the public quiz pages (title, intro, structure: the same
 * for everyone). The tag is expired by the admin actions that change what
 * those pages show, so edits and unpublishing show up on the next request.
 */
export const QUIZ_PAGES_TAG = "quiz-pages";

/** One cache entry per quiz and language. */
export const getCachedQuizPage = unstable_cache(
  async (slug: string, locale: string = "en") => getPublishedQuizPage(db, slug, locale),
  ["public-quiz-page"],
  { tags: [QUIZ_PAGES_TAG], revalidate: 300 },
);

/**
 * The page in the language to show: `lang` (?lang=) if the quiz offers it,
 * else the browser's best offered language, else English.
 */
export async function getLocalizedQuizPage(slug: string, lang: unknown, acceptLanguage: string | null) {
  const english = await getCachedQuizPage(slug, "en");
  if (!english) return null;
  const locale = pickLocale(lang, acceptLanguage, english.quiz.languages);
  return locale === "en" ? english : ((await getCachedQuizPage(slug, locale)) ?? english);
}

/** Hosted quizzes only: headless ones live on their own front end. */
export const getCachedPublishedQuizzes = unstable_cache(
  async () => listPublishedQuizzes(db, { hostedOnly: true }),
  ["public-hosted-quiz-list"],
  { tags: [QUIZ_PAGES_TAG], revalidate: 300 },
);

/** Site-wide CSS for respondent pages (expired with the pages when Settings change). */
export const getCachedSiteCss = unstable_cache(async () => getSiteCss(db), ["site-css"], {
  tags: [QUIZ_PAGES_TAG],
  revalidate: 300,
});

/** Call from server actions after a change to a quiz's title, slug, intro, status or delivery. */
export function expireQuizPages() {
  updateTag(QUIZ_PAGES_TAG);
}
