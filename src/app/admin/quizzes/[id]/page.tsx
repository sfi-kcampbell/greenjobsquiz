import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { loadQuiz } from "./load";
import { DeleteQuizForm, SettingsForm } from "./settings-form";

export async function generateMetadata({ params }: PageProps<"/admin/quizzes/[id]">): Promise<Metadata> {
  const quiz = await loadQuiz((await params).id);
  return { title: `${quiz.title} settings` };
}

export default async function QuizSettingsPage({ params }: PageProps<"/admin/quizzes/[id]">) {
  const quiz = await loadQuiz((await params).id);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Link href="/admin/quizzes" className="text-sm text-muted hover:text-foreground">
          ← All quizzes
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{quiz.title}</h1>
          <StatusBadge status={quiz.status} />
        </div>
        <Link
          href={`/admin/quizzes/${quiz.id}/builder/categories`}
          className="w-fit text-brand underline underline-offset-4"
        >
          Open builder
        </Link>
      </div>

      <section aria-labelledby="details" className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
        <h2 id="details" className="font-semibold">
          Details
        </h2>
        <SettingsForm quizId={quiz.id} title={quiz.title} slug={quiz.slug} />
        <p className="text-sm text-muted">Publishing arrives with the public quiz pages in Phase 5.</p>
      </section>

      <section aria-labelledby="danger" className="flex flex-col gap-3 rounded-lg border border-danger/30 bg-surface p-4">
        <h2 id="danger" className="font-semibold text-danger">
          Delete quiz
        </h2>
        <p className="text-sm text-muted">
          Deletes the quiz with all its categories, questions and job types. Quizzes with submissions
          can&apos;t be deleted.
        </p>
        <DeleteQuizForm quizId={quiz.id} title={quiz.title} />
      </section>
    </div>
  );
}
