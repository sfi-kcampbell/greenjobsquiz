import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { healthReport } from "@/lib/scoring/health";
import { loadBundle, loadQuiz } from "../load";
import { BuilderTabs } from "./builder-tabs";

export default async function BuilderLayout({ children, params }: LayoutProps<"/admin/quizzes/[id]/builder">) {
  const quiz = await loadQuiz((await params).id);
  const healthCount = healthReport((await loadBundle(quiz.id)).health).warningCount;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/admin/quizzes" className="text-sm text-muted hover:text-foreground">
          ← All quizzes
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{quiz.title}</h1>
          <StatusBadge status={quiz.status} />
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
