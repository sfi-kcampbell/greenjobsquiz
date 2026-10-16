import type { Metadata } from "next";
import Link from "next/link";
import { translationStatus } from "@/lib/content/translations";
import { readWorkingContent } from "@/lib/content/versions";
import { db } from "@/lib/db/client";
import { EXTRA_LOCALES, LOCALE_NAMES_EN } from "@/lib/i18n/locales";
import { healthReport, type HealthTarget } from "@/lib/scoring/health";
import { loadBundle, loadQuiz } from "../../load";

export const metadata: Metadata = { title: "Health" };

export default async function HealthPage({ params }: PageProps<"/admin/quizzes/[id]/builder/health">) {
  const quiz = await loadQuiz((await params).id);
  const bundle = await loadBundle(quiz.id);
  const report = healthReport(bundle.health);
  const base = `/admin/quizzes/${quiz.id}/builder`;
  const href = (t: HealthTarget) => (t.tab === "response" ? `${base}/responses/${t.responseId}` : `${base}/${t.tab}`);

  const problems = report.checks.filter((c) => c.items.length > 0);
  const warnings = problems.filter((c) => c.severity === "warning");
  const notes = problems.filter((c) => c.severity === "info");
  const passed = report.checks.filter((c) => c.items.length === 0);
  const maxBar = Math.max(1, ...report.balance.map((b) => b.max));
  // Offered languages with untranslated or out-of-date text (shown in English meanwhile).
  const status = quiz.languages.length ? await translationStatus(db, quiz.id, await readWorkingContent(db, quiz.id)) : {};
  const gaps = EXTRA_LOCALES.filter((l) => quiz.languages.includes(l) && (status[l].done < status[l].total || status[l].stale > 0));

  return (
    <section aria-labelledby="health-heading" className="flex flex-col gap-6">
      <div>
        <h2 id="health-heading" className="text-lg font-semibold">
          Health
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Checks for authoring problems that make results unreliable. These are warnings only; nothing here stops
          you from publishing.
        </p>
      </div>

      {warnings.length === 0 ? (
        <p role="status" className="rounded-md border border-brand/30 bg-brand/5 p-3 text-sm text-brand">
          No problems found.
        </p>
      ) : (
        <CheckList title="Needs attention" checks={warnings} href={href} tone="warning" />
      )}
      {notes.length > 0 && <CheckList title="Worth a look" checks={notes} href={href} tone="info" />}

      {gaps.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 text-sm">
          <h3 className="font-semibold">Translations</h3>
          <p className="text-muted">Untranslated text shows in English, so these don&apos;t affect results.</p>
          <ul className="flex flex-col gap-1">
            {gaps.map((l) => (
              <li key={l}>
                {LOCALE_NAMES_EN[l]}: {status[l].done} of {status[l].total} texts translated
                {status[l].stale > 0 && `, ${status[l].stale} need${status[l].stale === 1 ? "s" : ""} review`}.{" "}
                <Link href={`${base}/translations?lang=${l}`} className="text-brand underline underline-offset-4">
                  Translate<span className="sr-only"> into {LOCALE_NAMES_EN[l]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <h3 className="font-semibold">Category balance</h3>
        <p className="text-sm text-muted">
          The most each category can score, adding up the best answer for it in every question
          {bundle.settings.normalizePerCategory
            ? ". “Balance categories” is on, so scoring evens out differences here."
            : ". “Balance categories” is off, so a much larger category will dominate results."}
        </p>
        {report.balance.length === 0 ? (
          <p className="text-sm text-muted">No categories yet.</p>
        ) : (
          <table className="w-full max-w-3xl text-sm">
            <thead className="text-left text-muted">
              <tr>
                <th scope="col" className="py-1 font-medium">Category</th>
                <th scope="col" className="py-1 font-medium">Max score</th>
                <th scope="col" className="w-1/2 py-1">
                  <span className="sr-only">Bar</span>
                </th>
                <th scope="col" className="py-1 font-medium">Answers</th>
                <th scope="col" className="py-1 font-medium">Responses</th>
              </tr>
            </thead>
            <tbody>
              {report.balance.map((b) => {
                const color = bundle.display.categories.find((c) => c.id === b.categoryId)?.color ?? "#999";
                return (
                  <tr key={b.categoryId}>
                    <th scope="row" className="py-1 pr-3 text-left font-normal">
                      {b.name}
                    </th>
                    <td className="py-1 pr-3 tabular-nums">{Math.round(b.max * 100) / 100}</td>
                    <td className="py-1 pr-3">
                      <div aria-hidden className="h-3 rounded bg-background">
                        <div className="h-3 rounded" style={{ width: `${(b.max / maxBar) * 100}%`, backgroundColor: color }} />
                      </div>
                    </td>
                    <td className="py-1 pr-3 tabular-nums">{b.answerUses}</td>
                    <td className="py-1 tabular-nums">{b.responseUses}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {passed.length > 0 && (
        <details className="text-sm text-muted">
          <summary className="cursor-pointer">Passed checks ({passed.length})</summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
            {passed.map((c) => (
              <li key={c.id}>{c.title}: none</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function CheckList({
  title,
  checks,
  href,
  tone,
}: {
  title: string;
  checks: ReturnType<typeof healthReport>["checks"];
  href: (t: HealthTarget) => string;
  tone: "warning" | "info";
}) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="font-semibold">{title}</h3>
      <ul className="flex flex-col gap-3">
        {checks.map((check) => (
          <li
            key={check.id}
            className={`rounded-lg border bg-surface p-4 ${tone === "warning" ? "border-amber-600/40" : "border-border"}`}
          >
            <p className="font-medium">
              {tone === "warning" ? "⚠ " : "ℹ "}
              {check.title} <span className="text-muted">({check.items.length})</span>
            </p>
            <p className="mt-1 text-sm text-muted">{check.why}</p>
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {check.items.map((item, i) => (
                <li key={i}>
                  <Link href={href(item.target)} className="text-brand underline underline-offset-4">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
