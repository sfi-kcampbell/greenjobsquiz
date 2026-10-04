import type { Metadata } from "next";
import Link from "next/link";
import { listCategories } from "@/lib/content/categories";
import { listQuestions } from "@/lib/content/questions";
import { db } from "@/lib/db/client";
import { loadQuiz } from "../../load";
import { QuestionsEditorLoader } from "./loader";

export const metadata: Metadata = { title: "Questions" };

export default async function QuestionsPage({ params }: PageProps<"/admin/quizzes/[id]/builder/questions">) {
  const quiz = await loadQuiz((await params).id);
  const [categories, questions] = await Promise.all([listCategories(db, quiz.id), listQuestions(db, quiz.id)]);

  return (
    <section aria-labelledby="questions-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="questions-heading" className="text-lg font-semibold">
          Questions
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Each answer gets a weight in every category, from −5 (strongly against) to +5 (strongly
          for). In the grid, use the arrow keys to move between cells and Shift+↑/↓ to change a
          value.
        </p>
      </div>
      {categories.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-6">
          <p className="font-medium">Add categories first.</p>
          <p className="mt-1 text-sm text-muted">Answers are weighted against the quiz&apos;s categories.</p>
          <Link
            href={`/admin/quizzes/${quiz.id}/builder/categories`}
            className="mt-3 inline-block text-brand underline underline-offset-4"
          >
            Go to Categories
          </Link>
        </div>
      ) : (
        <QuestionsEditorLoader
          quizId={quiz.id}
          categories={categories.map(({ id, name, abbr, color }) => ({ id, name, abbr, color }))}
          initial={questions}
        />
      )}
    </section>
  );
}
