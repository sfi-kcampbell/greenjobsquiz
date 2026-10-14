import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RichHtml } from "@/components/quiz/rich-html";
import { idSchema } from "@/lib/content/action-result";
import { diffContent, getVersion, readWorkingContent } from "@/lib/content/versions";
import { db } from "@/lib/db/client";
import { sanitizeRichText } from "@/lib/sanitize/rich-text";
import { loadQuiz } from "../../load";

export const metadata: Metadata = { title: "Version" };

const when = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

/** A published version, read-only, compared with the current draft. */
export default async function VersionPage({ params }: PageProps<"/admin/quizzes/[id]/versions/[n]">) {
  const p = await params;
  const quiz = await loadQuiz(p.id);
  const n = idSchema.safeParse(p.n);
  const version = n.success ? await getVersion(db, quiz.id, n.data) : null;
  if (!version) notFound();
  const c = version.content;
  const changes = diffContent(c, await readWorkingContent(db, quiz.id));
  const catName = new Map(c.categories.map((x) => [String(x.id), x.name]));
  const weightsText = (w: Record<string, number>) =>
    Object.entries(w)
      .map(([id, v]) => `${catName.get(id) ?? `#${id}`} ${v > 0 ? "+" : ""}${v}`)
      .join(", ");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href={`/admin/quizzes/${quiz.id}#versions`} className="text-sm text-muted hover:text-foreground">
          ← {quiz.title} settings
        </Link>
        <h1 className="text-2xl font-semibold">Version {version.number}</h1>
        <p className="text-sm text-muted">
          Published {when.format(version.publishedAt)} UTC{version.publishedBy ? ` by ${version.publishedBy}` : ""}
          {version.note ? ` · ${version.note}` : ""}
        </p>
      </div>

      <section aria-labelledby="compare" className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 text-sm">
        <h2 id="compare" className="font-semibold">
          Compared with the draft
        </h2>
        {changes.length === 0 ? (
          <p>The draft is the same as this version.</p>
        ) : (
          <>
            <p className="text-muted">The draft differs from this version:</p>
            <ul className="list-disc pl-5">
              {changes.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby="v-content" className="flex flex-col gap-4">
        <h2 id="v-content" className="text-lg font-semibold">
          {c.title}
        </h2>
        <RichHtml html={sanitizeRichText(c.introHtml)} className="text-muted" />
        <h3 className="font-semibold">Categories</h3>
        <p className="text-sm">{c.categories.map((x) => x.name).join(", ") || "None"}</p>
        <h3 className="font-semibold">Questions</h3>
        <ol className="flex flex-col gap-3">
          {c.questions.map((q, i) => (
            <li key={q.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
              <p className="font-medium">
                {i + 1}. {q.title}{" "}
                <span className="text-muted">
                  ({q.type === "multi" ? `choose ${q.minSelect}–${q.maxSelect}` : "one answer"}
                  {q.required ? "" : ", optional"})
                </span>
              </p>
              <ul className="mt-1 list-disc pl-5">
                {q.answers.map((a) => (
                  <li key={a.id}>
                    {a.label} <span className="text-muted">{weightsText(a.weights) || "no weights"}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
        <h3 className="font-semibold">Responses</h3>
        <ul className="flex flex-col gap-2 text-sm">
          {c.responses.map((r) => (
            <li key={r.id} className="rounded-lg border border-border bg-surface p-3">
              <p className="font-medium">{r.title}</p>
              {r.excerpt && <p>{r.excerpt}</p>}
              <p className="text-muted">{weightsText(r.weights) || "no weights"}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
