import Link from "next/link";

export default function ResultNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">This result link isn&apos;t valid</h1>
      <p className="text-muted">It may have been mistyped, or removed.</p>
      <p>
        <Link href="/quizzes" className="text-brand underline underline-offset-4">
          See all quizzes
        </Link>
      </p>
    </main>
  );
}
