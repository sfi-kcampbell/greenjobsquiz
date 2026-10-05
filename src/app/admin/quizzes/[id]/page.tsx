import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { listResponses } from "@/lib/content/responses";
import { db } from "@/lib/db/client";
import { appUrl } from "@/lib/app-url";
import { healthReport } from "@/lib/scoring/health";
import { loadBundle, loadQuiz } from "./load";
import { PublishControl } from "./publish-control";
import { ScoringForm } from "./scoring-form";
import { DeleteQuizForm, SettingsForm } from "./settings-form";

export async function generateMetadata({ params }: PageProps<"/admin/quizzes/[id]">): Promise<Metadata> {
  const quiz = await loadQuiz((await params).id);
  return { title: `${quiz.title} settings` };
}

export default async function QuizSettingsPage({ params }: PageProps<"/admin/quizzes/[id]">) {
  const quiz = await loadQuiz((await params).id);
  const responses = await listResponses(db, quiz.id);
  const healthWarnings = healthReport((await loadBundle(quiz.id)).health).warningCount;
  const base = await appUrl();
  const apiUrl = `${base}/api/v1/quizzes/${quiz.id}`;
  const pageUrl = `${base}/quizzes/${quiz.slug}`;

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
        <SettingsForm quizId={quiz.id} title={quiz.title} slug={quiz.slug} introHtml={quiz.introHtml} />
      </section>

      <section aria-labelledby="publishing" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <h2 id="publishing" className="font-semibold">
          Publishing
        </h2>
        <PublishControl quizId={quiz.id} status={quiz.status} healthWarnings={healthWarnings} apiUrl={apiUrl} pageUrl={pageUrl} />
      </section>

      <section aria-labelledby="scoring" className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
        <h2 id="scoring" className="font-semibold">
          Scoring
        </h2>
        <ScoringForm
          quizId={quiz.id}
          runnersUpCount={quiz.runnersUpCount}
          normalizePerCategory={quiz.normalizePerCategory}
          defaultResultId={quiz.defaultResultId}
          responses={responses.map(({ id, title }) => ({ id, title }))}
        />
      </section>

      <section aria-labelledby="danger" className="flex flex-col gap-3 rounded-lg border border-danger/30 bg-surface p-4">
        <h2 id="danger" className="font-semibold text-danger">
          Delete quiz
        </h2>
        <p className="text-sm text-muted">
          Deletes the quiz with all its categories, questions and responses. Quizzes with submissions
          can&apos;t be deleted.
        </p>
        <DeleteQuizForm quizId={quiz.id} title={quiz.title} />
      </section>
    </div>
  );
}
