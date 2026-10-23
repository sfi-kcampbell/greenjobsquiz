import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { idSchema } from "@/lib/content/action-result";
import { listCategories } from "@/lib/content/categories";
import { getResponse } from "@/lib/content/responses";
import { listGroups, listSubResponses, responseSubResponseIds } from "@/lib/content/sub-responses";
import { db } from "@/lib/db/client";
import { loadQuiz } from "../../../load";
import { ResponseForm } from "./response-form";
import { SubResponsesPanel } from "./sub-responses-panel";

type Props = PageProps<"/admin/quizzes/[id]/builder/responses/[responseId]">;

async function load(params: Props["params"]) {
  const { id, responseId } = await params;
  const quiz = await loadQuiz(id);
  const rid = idSchema.safeParse(responseId);
  if (!rid.success) notFound();
  const response = await getResponse(db, quiz.id, rid.data);
  if (!response) notFound();
  return { quiz, response };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { response } = await load(params);
  return { title: response.title };
}

export default async function ResponsePage({ params }: Props) {
  const { quiz, response } = await load(params);
  const categories = await listCategories(db, quiz.id);
  const [groups, items, linked] = await Promise.all([listGroups(db, quiz.id), listSubResponses(db, quiz.id), responseSubResponseIds(db, response.id)]);

  return (
    <section aria-labelledby="response-heading" className="flex flex-col gap-4">
      <Link
        href={`/admin/quizzes/${quiz.id}/builder/responses`}
        className="w-fit text-sm text-muted hover:text-foreground"
      >
        ← All responses
      </Link>
      <h2 id="response-heading" className="text-lg font-semibold">
        Edit response
      </h2>
      <ResponseForm
        quizId={quiz.id}
        response={response}
        categories={categories.map(({ id, name, abbr, color }) => ({ id, name, abbr, color }))}
      />
      <section aria-labelledby="sub-responses-heading" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <h3 id="sub-responses-heading" className="font-semibold">
          Sub-responses
        </h3>
        <p className="text-sm text-muted">
          Listed under this response&apos;s description, a heading per group. The best match shows all of them; as a
          runner-up it shows as many per group as the quiz&apos;s Scoring setting allows.
        </p>
        <SubResponsesPanel
          quizId={quiz.id}
          responseId={response.id}
          responseTitle={response.title}
          groups={groups.map(({ id, name }) => ({ id, name }))}
          items={items.map(({ id, groupId, title }) => ({ id, groupId, title }))}
          initialIds={linked}
        />
      </section>
    </section>
  );
}
