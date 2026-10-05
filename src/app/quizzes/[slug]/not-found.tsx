import Link from "next/link";

export default function QuizNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">This quiz isn&apos;t available</h1>
      <p className="text-muted">It may have been unpublished, or the link may be mistyped.</p>
      <p>
        <Link href="/" className="text-brand underline underline-offset-4">
          See all quizzes
        </Link>
      </p>
    </main>
  );
}
