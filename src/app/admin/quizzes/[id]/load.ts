import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { requireStaff } from "@/lib/auth/access";
import { idSchema } from "@/lib/content/action-result";
import { getQuiz } from "@/lib/content/quizzes";
import { db } from "@/lib/db/client";

/** Loads the quiz for an admin route (checking access), or 404s. Memoized per request. */
export const loadQuiz = cache(async (idParam: string) => {
  await requireStaff();
  const id = idSchema.safeParse(idParam);
  if (!id.success) notFound();
  const quiz = await getQuiz(db, id.data);
  if (!quiz) notFound();
  return quiz;
});
