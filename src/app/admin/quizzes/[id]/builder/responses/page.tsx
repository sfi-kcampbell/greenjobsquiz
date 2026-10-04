import type { Metadata } from "next";
import Link from "next/link";
import { listCategories } from "@/lib/content/categories";
import { listResponses } from "@/lib/content/responses";
import { db } from "@/lib/db/client";
import { loadQuiz } from "../../load";
import { ResponsesEditor } from "./responses-editor";

export const metadata: Metadata = { title: "Responses" };

export default async function ResponsesPage({ params }: PageProps<"/admin/quizzes/[id]/builder/responses">) {
  const quiz = await loadQuiz((await params).id);
  const [categories, responses] = await Promise.all([listCategories(db, quiz.id), listResponses(db, quiz.id)]);

  return (
    <section aria-labelledby="responses-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="responses-heading" className="text-lg font-semibold">
          Responses
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Responses are what the quiz can recommend. Give each one a weight in every category, from
          −5 (strongly against) to +5 (strongly for). Respondents are matched to the response whose
          profile has the most similar shape to theirs, so only the proportions between categories
          matter, not the size of the numbers.
        </p>
      </div>
      {categories.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface p-6">
          <p className="font-medium">Add categories first.</p>
          <p className="mt-1 text-sm text-muted">Responses are weighted against the quiz&apos;s categories.</p>
          <Link
            href={`/admin/quizzes/${quiz.id}/builder/categories`}
            className="mt-3 inline-block text-brand underline underline-offset-4"
          >
            Go to Categories
          </Link>
        </div>
      ) : (
        <ResponsesEditor
          quizId={quiz.id}
          runnersUpCount={quiz.runnersUpCount}
          categories={categories.map(({ id, name, abbr, color }) => ({ id, name, abbr, color }))}
          initial={responses}
        />
      )}
    </section>
  );
}
