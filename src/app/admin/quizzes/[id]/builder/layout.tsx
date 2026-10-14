import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { draftChanges } from "@/lib/content/versions";
import { db } from "@/lib/db/client";
import { healthReport } from "@/lib/scoring/health";
import { loadBundle, loadQuiz } from "../load";
import { BuilderTabs } from "./builder-tabs";

export default async function BuilderLayout({ children, params }: LayoutProps<"/admin/quizzes/[id]/builder">) {
  const quiz = await loadQuiz((await params).id);
  const healthCount = healthReport((await loadBundle(quiz.id)).health).warningCount;
  const draft = await draftChanges(db, quiz.id);
  const unpublished = draft !== null && draft.changes.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/admin/quizzes" className="text-sm text-muted hover:text-foreground">
          ← All quizzes
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{quiz.title}</h1>
          <StatusBadge status={quiz.status} />
          {unpublished && (
            <Link
              href={`/admin/quizzes/${quiz.id}#publishing`}
              className="rounded-full border border-amber-600/40 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-950 hover:underline"
              title="Edits here are a draft until you publish them. Try them in Simulate."
            >
              Unpublished changes ({draft.changes.length})
            </Link>
          )}
          <Link href={`/admin/quizzes/${quiz.id}`} className="ml-auto text-sm text-brand underline underline-offset-4">
            Quiz settings
          </Link>
        </div>
      </div>
      <BuilderTabs quizId={quiz.id} healthCount={healthCount} />
      {children}
    </div>
  );
}
