import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Banner } from "@/components/quiz/banner";
import { CustomCss } from "@/components/quiz/custom-css";
import { PrintButton } from "@/app/quiz-result/[token]/print-button";
import { REPORT_MIN_FINISHED } from "@/lib/content/quiz-code-rules";
import { codeReport } from "@/lib/content/quiz-codes";
import { getSiteCss } from "@/lib/content/settings";
import { db } from "@/lib/db/client";
import { getQuizBranding } from "@/lib/public/structure";

/**
 * A teacher's (or mailer owner's) anonymous summary for one quiz code. The
 * token is the credential: never cached or indexed, no referrer (next.config.ts).
 * Nothing about individuals: counts, response shares and an average profile,
 * only once enough people have finished.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Quiz code summary", robots: { index: false, follow: false } };

const day = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" });

export default async function CodeReportPage({ params }: PageProps<"/quiz-codes/report/[token]">) {
  const report = await codeReport(db, (await params).token);
  if (!report) notFound();
  const branding = await getQuizBranding(db, report.quiz.id);
  const { code } = report;
  const dates =
    code.opensAt || code.closesAt
      ? `${code.opensAt ? day.format(code.opensAt) : "Any time"} to ${code.closesAt ? day.format(new Date(code.closesAt.getTime() - 86_400_000)) : "no end date"}`
      : null;

  return (
    <main className="pltq-quiz mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <CustomCss site={await getSiteCss(db)} quiz={branding.customCss} />
      <Banner banner={branding.banner} />
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted">{report.quiz.title}</p>
        <h1 className="pltq-title text-3xl font-semibold">
          Summary for code <span className="font-mono tracking-wider">{code.code}</span>
        </h1>
        {code.label && <p className="text-lg">{code.label}</p>}
        {dates && <p className="text-sm text-muted">{dates} (UTC)</p>}
      </header>

      <dl className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-surface p-4">
          <dt className="text-sm text-muted">Started</dt>
          <dd className="text-3xl font-semibold tabular-nums">{report.started}</dd>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <dt className="text-sm text-muted">Finished</dt>
          <dd className="text-3xl font-semibold tabular-nums">{report.finished}</dd>
        </div>
      </dl>

      {report.summary ? (
        <>
          <section aria-labelledby="matches" className="flex flex-col gap-3">
            <h2 id="matches" className="text-lg font-semibold">
              Best matches
            </h2>
            <ul className="flex flex-col gap-3">
              {report.summary.responses.map((r) => (
                <li key={r.title} className="flex flex-col gap-1">
                  <span className="flex justify-between gap-2 text-sm">
                    <span className="font-medium">{r.title}</span>
                    <span className="tabular-nums text-muted">
                      {r.percent}% ({r.count})
                    </span>
                  </span>
                  <span aria-hidden className="pltq-bar meter-track block h-3 overflow-hidden rounded-full bg-border">
                    <span className="meter-fill block h-full rounded-full bg-brand" style={{ width: `${r.percent}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="profile" className="pltq-profile flex flex-col gap-3">
            <h2 id="profile" className="text-lg font-semibold">
              Average profile
            </h2>
            <ul className="flex flex-col gap-3">
              {report.summary.profile.map((c) => (
                <li key={c.label} className="flex flex-col gap-1">
                  <span className="flex justify-between gap-2 text-sm">
                    <span className="font-medium">{c.label}</span>
                    <span className="tabular-nums text-muted">{c.percent}%</span>
                  </span>
                  <span aria-hidden className="pltq-bar meter-track block h-3 overflow-hidden rounded-full bg-border">
                    <span className="meter-fill block h-full rounded-full" style={{ width: `${c.percent}%`, backgroundColor: c.color }} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <p role="status" className="rounded-lg border border-border bg-surface p-4">
          Results appear once {REPORT_MIN_FINISHED} people have finished, so no one can be singled out.
          {report.finished > 0 ? ` ${report.finished} so far.` : ""}
        </p>
      )}

      <p className="text-sm text-muted">
        Anonymous: no names, emails or individual answers are shown. Anyone with this link can see this page, so share
        it only with people who should.
      </p>
      <div className="no-print">
        <PrintButton />
      </div>
    </main>
  );
}
