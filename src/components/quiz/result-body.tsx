import type { Ref } from "react";
import type { ResultPayload } from "@/lib/public/sessions";
import { RichHtml } from "./rich-html";

/**
 * The result itself: best match, runners-up and the category profile (every
 * bar with its percentage as text). No hooks, so the interactive result screen
 * and the printable /quiz-result page share it.
 */
export function ResultBody({ result, headingRef }: { result: ResultPayload; headingRef?: Ref<HTMLHeadingElement> }) {
  const { match } = result;
  const scores = Object.entries(result.scores).sort((a, b) => b[1].percent - a[1].percent);

  return (
    <>
      <section aria-labelledby="result-title" className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6">
        <p className="text-sm font-medium uppercase tracking-wide text-muted">Your best match</p>
        {match ? (
          <>
            <h2 id="result-title" ref={headingRef} tabIndex={-1} className="text-3xl font-semibold focus:outline-none">
              {match.title}
            </h2>
            {match.percent !== null && !result.isFallback && (
              <p className="text-lg">
                <strong className="text-brand">{match.percent}% match</strong>
              </p>
            )}
            {result.isClose && (
              <p className="text-muted">It was close: your next match scored almost the same, so take a look below too.</p>
            )}
            {result.status === "insufficient_data" && (
              <p className="text-muted">Your answers didn&apos;t point clearly to one match, so here&apos;s a good place to start.</p>
            )}
            <RichHtml html={match.bodyHtml} />
            {!match.bodyHtml && match.excerpt && <p>{match.excerpt}</p>}
            {match.ctaUrl && match.ctaLabel && (
              <p>
                <a
                  href={match.ctaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block rounded-md border border-transparent bg-brand px-5 py-2.5 font-medium text-white hover:bg-brand-strong"
                >
                  {match.ctaLabel}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </p>
            )}
          </>
        ) : (
          <h2 id="result-title" ref={headingRef} tabIndex={-1} className="text-2xl font-semibold focus:outline-none">
            We couldn&apos;t find a match from your answers.
          </h2>
        )}
      </section>

      {result.runnersUp.length > 0 && (
        <section aria-labelledby="runners-up" className="flex flex-col gap-3">
          <h3 id="runners-up" className="text-lg font-semibold">
            Also a good fit
          </h3>
          <ul className="flex flex-col gap-3">
            {result.runnersUp.map((r) => (
              <li key={r.resultId} className="rounded-lg border border-border bg-surface p-4">
                <p className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold">{r.title}</span>
                  <span className="text-sm text-muted tabular-nums">{r.percent}% match</span>
                </p>
                {r.excerpt && <p className="mt-1 text-muted">{r.excerpt}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {scores.length > 0 && (
        <section aria-labelledby="profile" className="flex flex-col gap-3">
          <h3 id="profile" className="text-lg font-semibold">
            Your profile
          </h3>
          <ul className="flex flex-col gap-3">
            {scores.map(([id, s]) => (
              <li key={id} className="flex flex-col gap-1">
                <span className="flex justify-between gap-2 text-sm">
                  <span className="font-medium">{s.label}</span>
                  <span className="tabular-nums text-muted">{s.percent}%</span>
                </span>
                <span aria-hidden className="meter-track block h-3 overflow-hidden rounded-full bg-border">
                  <span className="meter-fill block h-full rounded-full" style={{ width: `${s.percent}%`, backgroundColor: s.color }} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

    </>
  );
}
