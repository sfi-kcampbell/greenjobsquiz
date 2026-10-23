import type { Metadata } from "next";
import { listGroups, listSubResponses } from "@/lib/content/sub-responses";
import { db } from "@/lib/db/client";
import { loadQuiz } from "../../load";
import { SubResponsesEditor } from "./sub-responses-editor";

export const metadata: Metadata = { title: "Sub-responses" };

export default async function SubResponsesPage({ params }: PageProps<"/admin/quizzes/[id]/builder/sub-responses">) {
  const quiz = await loadQuiz((await params).id);
  const [groups, items] = await Promise.all([listGroups(db, quiz.id), listSubResponses(db, quiz.id)]);
  return (
    <section aria-labelledby="sub-responses-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="sub-responses-heading" className="text-lg font-semibold">
          Sub-responses
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Items listed under a response, such as jobs under a personality type. Set them up here in groups (each group
          is a heading, like &ldquo;Jobs&rdquo;), then add them to responses on each response&apos;s page. One item can
          be listed under several responses. The best match shows all of its sub-responses; runners-up show as many
          as the quiz&apos;s Scoring setting allows.
        </p>
      </div>
      <SubResponsesEditor quizId={quiz.id} initialGroups={groups} initialItems={items} />
    </section>
  );
}
