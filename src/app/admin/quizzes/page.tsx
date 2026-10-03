import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { requireStaff } from "@/lib/auth/access";
import { listQuizzes } from "@/lib/content/quizzes";
import { db } from "@/lib/db/client";
import { NewQuizForm } from "./new-quiz-form";

export const metadata: Metadata = { title: "Quizzes" };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export default async function QuizzesPage() {
  await requireStaff();
  const quizzes = await listQuizzes(db);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Quizzes</h1>

      <section aria-labelledby="new-quiz" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <h2 id="new-quiz" className="font-semibold">
          New quiz
        </h2>
        <NewQuizForm />
      </section>

      {quizzes.length === 0 ? (
        <p className="text-muted">No quizzes yet. Create one above to start building.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Title</th>
                <th scope="col" className="px-4 py-2 font-medium">URL slug</th>
                <th scope="col" className="px-4 py-2 font-medium">Status</th>
                <th scope="col" className="px-4 py-2 font-medium">Categories</th>
                <th scope="col" className="px-4 py-2 font-medium">Updated</th>
                <th scope="col" className="px-4 py-2 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {quizzes.map((quiz) => (
                <tr key={quiz.id}>
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/admin/quizzes/${quiz.id}/builder/categories`} className="hover:underline">
                      {quiz.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{quiz.slug}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={quiz.status} />
                  </td>
                  <td className="px-4 py-3">{quiz.categoryCount}</td>
                  <td className="px-4 py-3 text-muted">{dateFormat.format(quiz.updatedAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-4">
                      <Link
                        href={`/admin/quizzes/${quiz.id}/builder/categories`}
                        className="text-brand underline underline-offset-4"
                      >
                        Open builder
                      </Link>
                      <Link href={`/admin/quizzes/${quiz.id}`} className="text-brand underline underline-offset-4">
                        Settings
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
