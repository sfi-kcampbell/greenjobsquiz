import type { Metadata } from "next";
import { listCategories } from "@/lib/content/categories";
import { db } from "@/lib/db/client";
import { loadQuiz } from "../../load";
import { CategoriesEditor } from "./categories-editor";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage({ params }: PageProps<"/admin/quizzes/[id]/builder/categories">) {
  const quiz = await loadQuiz((await params).id);
  const categories = await listCategories(db, quiz.id);

  return (
    <section aria-labelledby="categories-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="categories-heading" className="text-lg font-semibold">
          Categories
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Categories are the traits answers and responses are scored on. Every answer and response
          gets a weight from −5 (strongly against) to +5 (strongly for) in each category.
          Importance multiplies a category&apos;s effect on the score.
        </p>
      </div>
      <CategoriesEditor quizId={quiz.id} initial={categories} />
    </section>
  );
}
