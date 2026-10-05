import "server-only";
import { unstable_cache, updateTag } from "next/cache";
import { db } from "@/lib/db/client";
import { getPublishedQuiz, listPublishedQuizzes } from "./structure";

/**
 * Cached reads for the public quiz pages (title, intro, structure: the same
 * for everyone). The tag is expired by the admin actions that change what
 * those pages show, so edits and unpublishing show up on the next request.
 */
export const QUIZ_PAGES_TAG = "quiz-pages";

export const getCachedQuizBySlug = unstable_cache(
  async (slug: string) => getPublishedQuiz(db, { slug }),
  ["public-quiz-by-slug"],
  { tags: [QUIZ_PAGES_TAG], revalidate: 300 },
);

export const getCachedPublishedQuizzes = unstable_cache(
  async () => listPublishedQuizzes(db),
  ["public-quiz-list"],
  { tags: [QUIZ_PAGES_TAG], revalidate: 300 },
);

/** Call from server actions after a change to a quiz's title, slug, intro or status. */
export function expireQuizPages() {
  updateTag(QUIZ_PAGES_TAG);
}
