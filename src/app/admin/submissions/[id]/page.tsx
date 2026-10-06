import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSubmissionDetail } from "@/lib/admin/submissions";
import { requireSuperAdmin } from "@/lib/auth/access";
import { db } from "@/lib/db/client";
import { dateTime, duration } from "../format";
import { DeleteSubmissionButton, RevokeShareButton } from "./detail-actions";

export const metadata: Metadata = { title: "Submission" };

const num = (n: number) => (Math.round(n * 100) / 100).toString();
const signed = (n: number) => (n > 0 ? `+${num(n)}` : num(n));

function Panel({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <h2 id={id} className="font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Chips({ items }: { items: { label: string; value: number }[] }) {
  if (!items.length) return <span className="text-muted">none</span>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((c) => (
        <li key={c.label} className="rounded border border-border bg-background px-1.5 py-0.5 text-xs tabular-nums">
          {c.label} {signed(c.value)}
        </li>
      ))}
    </ul>
  );
}

export default async function SubmissionPage({ params, searchParams }: PageProps<"/admin/submissions/[id]">) {
  await requireSuperAdmin();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const d = await getSubmissionDetail(db, id);
  if (!d) notFound();
  const rawBack = (await searchParams).back;
  const back = typeof rawBack === "string" && rawBack.startsWith("?") ? rawBack : "";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href={`/admin/submissions${back}`} className="text-sm text-muted hover:text-foreground">
          ← Submissions
        </Link>
        <h1 className="text-2xl font-semibold">
          {d.quiz.title}: attempt {d.attemptNo}
        </h1>
      </div>

      <Panel id="p-header" title="Submission">
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted">Quiz</dt>
          <dd>{d.quiz.title}</dd>
          <dt className="text-muted">Date (UTC)</dt>
          <dd>{dateTime.format(d.createdAt)}</dd>
          <dt className="text-muted">Time taken</dt>
          <dd>
            {duration(d.durationSeconds)}
            {d.suspect && <span className="ml-2 rounded bg-danger/10 px-1.5 text-xs text-danger">suspect: finished in under 3 seconds</span>}
          </dd>
          <dt className="text-muted">Respondent</dt>
          <dd>{d.email ?? "Anonymous"}</dd>
          <dt className="text-muted">Referrer</dt>
          <dd className="break-all">{d.referrer ?? "—"}</dd>
          <dt className="text-muted">IP hash</dt>
          <dd className="font-mono text-xs">{d.ipHashShort ? `${d.ipHashShort}…` : "—"}</dd>
          <dt className="text-muted">Scoring engine</dt>
          <dd>v{d.engineVersion}</dd>
        </dl>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {d.shareToken ? (
            <>
              <a href={`/quiz-result/${d.shareToken}`} target="_blank" rel="noopener" className="text-brand underline underline-offset-4">
                Open shared result<span className="sr-only"> (opens in a new tab)</span>
              </a>
              <RevokeShareButton id={d.id} />
            </>
          ) : (
            <span className="text-muted">{d.shareRevoked ? "Share link turned off." : "No share link."}</span>
          )}
          <DeleteSubmissionButton id={d.id} back={back} />
        </div>
      </Panel>

      <Panel id="p-match" title="Match">
        {d.match ? (
          <p className="text-lg">
            <strong>{d.match.title}</strong>
            {d.match.percent !== null && <span className="text-muted"> · {d.match.percent}% match</span>}
          </p>
        ) : (
          <p className="text-muted">No match.</p>
        )}
        {d.isFallback && <p className="text-sm text-muted">Fallback response: the answers didn&apos;t point anywhere clearly ({d.status}).</p>}
        {d.isClose && <p className="text-sm text-muted">Close call: second place was almost level.</p>}
        {d.ranking.length > 1 && (
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Every response, ranked</caption>
            <thead className="text-muted">
              <tr>
                <th scope="col" className="py-1 font-medium">#</th>
                <th scope="col" className="py-1 font-medium">Response (at submit time)</th>
                <th scope="col" className="py-1 font-medium">Match</th>
                <th scope="col" className="py-1 font-medium">Gap to first</th>
                <th scope="col" className="py-1 font-medium">Raw</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {d.ranking.map((r) => (
                <tr key={r.resultId}>
                  <td className="py-1 tabular-nums">{r.position}</td>
                  <td className="py-1">{r.title}</td>
                  <td className="py-1 tabular-nums">{r.percent}%</td>
                  <td className="py-1 tabular-nums">{r.position === 1 ? "—" : `−${r.gapPoints} pts (raw −${r.gapRaw.toFixed(3)})`}</td>
                  <td className="py-1 tabular-nums">{r.raw.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel id="p-profile" title="Category profile">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Scores per category</caption>
          <thead className="text-muted">
            <tr>
              <th scope="col" className="py-1 font-medium">Category</th>
              <th scope="col" className="py-1 font-medium">Raw</th>
              <th scope="col" className="py-1 font-medium">Normalized</th>
              <th scope="col" className="py-1 font-medium">Max</th>
              <th scope="col" className="py-1 font-medium">Share of max</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {d.categories.map((c) => (
              <tr key={c.categoryId}>
                <td className="py-1">{c.label}</td>
                <td className="py-1 tabular-nums">{num(c.raw)}</td>
                <td className="py-1 tabular-nums">{c.normalized === null ? "—" : num(c.normalized)}</td>
                <td className="py-1 tabular-nums">{num(c.max)}</td>
                <td className="py-1">
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="meter-track block h-2 w-24 overflow-hidden rounded-full bg-border">
                      <span className="meter-fill block h-full rounded-full" style={{ width: `${c.percentOfMax}%`, backgroundColor: c.color }} />
                    </span>
                    <span className="tabular-nums">{c.percentOfMax}%</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel id="p-transcript" title="Answers">
        <p className="text-sm text-muted">
          Titles, labels and weights as they were when this was submitted. &ldquo;Current content&rdquo; is today&apos;s text and may have changed since.
        </p>
        {d.transcript.length === 0 ? (
          <p className="text-muted">No questions were answered.</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {d.transcript.map((q, i) => (
              <li key={q.questionId} className="flex flex-col gap-2 border-t border-border pt-3 first:border-0 first:pt-0">
                <p className="font-medium">
                  {i + 1}. {q.questionTitle}
                </p>
                <ul className="flex flex-col gap-2 pl-4">
                  {q.answers.map((a) => (
                    <li key={a.answerId} className="flex flex-col gap-1 text-sm">
                      <span>
                        <strong>{a.label}</strong>
                        {!a.stillExists && <span className="ml-2 text-xs text-muted">(answer since removed)</span>}
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-muted">Weights then:</span>
                        <Chips items={a.weights} />
                      </span>
                      {a.currentBodyHtml && (
                        <details className="rounded border border-border bg-background px-2 py-1">
                          <summary className="cursor-pointer text-xs text-muted">Current content</summary>
                          <div className="rich-text mt-1" dangerouslySetInnerHTML={{ __html: a.currentBodyHtml }} />
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center gap-2 pl-4 text-sm">
                  <span className="text-muted">Contribution to the score:</span>
                  <Chips items={q.contribution} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}
