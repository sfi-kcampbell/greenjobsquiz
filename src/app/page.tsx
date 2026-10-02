import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold">PLT Green Jobs Quiz</h1>
      <p className="text-lg text-muted">
        Answer a few questions and we&apos;ll recommend a green career that fits you. Quizzes will
        appear here once they&apos;re published.
      </p>
      <p>
        <Link href="/admin" className="text-brand underline underline-offset-4">
          Staff sign-in
        </Link>
      </p>
    </main>
  );
}
