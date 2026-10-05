import Link from "next/link";
import { getCachedPublishedQuizzes } from "@/lib/public/page-cache";

export const revalidate = 300;

export default async function Home() {
  const quizzes = await getCachedPublishedQuizzes();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold">PLT Green Jobs Quiz</h1>
      <p className="text-lg text-muted">
        Answer a few questions and we&apos;ll recommend a green career that fits you.
      </p>
      {quizzes.length > 0 ? (
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
        <p className="text-muted">Quizzes will appear here once they&apos;re published.</p>
      )}
      <p>
        <Link href="/admin" className="text-sm text-muted underline underline-offset-4">
          Staff sign-in
        </Link>
      </p>
    </main>
  );
}
