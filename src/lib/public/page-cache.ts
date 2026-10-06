import "server-only";
import { unstable_cache, updateTag } from "next/cache";
import { db } from "@/lib/db/client";
import { getPublishedQuizPage, listPublishedQuizzes } from "./structure";

/**
 * Cached reads for the public quiz pages (title, intro, structure: the same
 * for everyone). The tag is expired by the admin actions that change what
 * those pages show, so edits and unpublishing show up on the next request.
 */
export const QUIZ_PAGES_TAG = "quiz-pages";

export const getCachedQuizPage = unstable_cache(
  async (slug: string) => getPublishedQuizPage(db, slug),
  ["public-quiz-page"],
  { tags: [QUIZ_PAGES_TAG], revalidate: 300 },
);

/** Hosted quizzes only: headless ones live on their own front end. */
export const getCachedPublishedQuizzes = unstable_cache(
  async () => listPublishedQuizzes(db, { hostedOnly: true }),
  ["public-hosted-quiz-list"],
  { tags: [QUIZ_PAGES_TAG], revalidate: 300 },
);

/** Call from server actions after a change to a quiz's title, slug, intro, status or delivery. */
export function expireQuizPages() {
  updateTag(QUIZ_PAGES_TAG);
}
