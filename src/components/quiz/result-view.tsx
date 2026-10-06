"use client";

import { useEffect, useRef } from "react";
import type { ResultPayload } from "@/lib/public/sessions";
import type { Attempt } from "./api";
import { RichHtml } from "./rich-html";

/** The respondent's result: top match, runners-up, category profile and earlier attempts. */
export function ResultView({
  result,
  attempts,
  onRetake,
  restarting,
  error,
}: {
  result: ResultPayload;
  attempts: Attempt[];
  /** Null when the quiz doesn't allow retakes. */
  onRetake: (() => void) | null;
  restarting: boolean;
  error: string | null;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const { match } = result;
  const scores = Object.entries(result.scores).sort((a, b) => b[1].percent - a[1].percent);
  const earlier = attempts.filter((a) => a.attemptNo !== result.attemptNo).reverse();

  return (
    <div className="flex flex-col gap-8">
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

      {earlier.length > 0 && (
        <section aria-labelledby="earlier" className="flex flex-col gap-3">
          <h3 id="earlier" className="text-lg font-semibold">
            Your earlier results
          </h3>
          <ul className="flex flex-col gap-2 text-sm">
            {earlier.map((a) => (
              <li key={a.attemptNo} className="flex flex-wrap justify-between gap-2 border-b border-border pb-2">
                <span>
                  <span className="text-muted">Attempt {a.attemptNo}: </span>
                  <span className="font-medium">{a.resultTitle ?? "No match"}</span>
                  {a.percent !== null && <span className="text-muted"> ({a.percent}% match)</span>}
                </span>
                <time dateTime={a.createdAt} className="text-muted">
                  {new Date(a.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                </time>
              </li>
            ))}
          </ul>
        </section>
      )}

      {onRetake && (
        <div className="flex flex-col items-start gap-2">
          {error && (
            <p role="alert" className="font-medium text-danger">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={onRetake}
            disabled={restarting}
            className="rounded-md border border-border bg-surface px-5 py-2.5 font-medium hover:bg-border/40 disabled:opacity-60"
          >
            {restarting ? "Starting over…" : "Take it again"}
          </button>
          <p className="text-sm text-muted">This result stays saved.</p>
        </div>
      )}
    </div>
  );
}
