import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/quiz/page-shell";
import { getCachedPublishedQuizzes } from "@/lib/public/page-cache";

export const metadata: Metadata = { title: "Quizzes" };
export const revalidate = 300;

/** Every published quiz hosted on this site. */
export default async function QuizIndex() {
  const quizzes = await getCachedPublishedQuizzes();
  return (
    <PageShell template="default">
      <h1 className="text-3xl font-semibold">Quizzes</h1>
      {quizzes.length ? (
        <ul className="flex flex-col gap-3">
          {quizzes.map((q) => (
            <li key={q.id}>
              <Link
                href={`/quizzes/${q.slug}`}
                className="block rounded-lg border border-border bg-surface px-4 py-3 text-lg font-medium hover:border-brand"
              >
                {q.title}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted">No quizzes are published yet.</p>
      )}
    </PageShell>
  );
}
