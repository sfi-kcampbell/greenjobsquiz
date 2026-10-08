"use client";

import { useEffect, useRef } from "react";
import type { ResultPayload } from "@/lib/public/sessions";
import type { Attempt } from "./api";
import { ResultActions } from "./result-actions";
import { ResultBody } from "./result-body";

/** The respondent's result: top match, runners-up, category profile and earlier attempts. */
export function ResultView({
  result,
  shareToken,
  attempts,
  onRetake,
  restarting,
  error,
}: {
  result: ResultPayload;
  /** For the share and print links; null if unknown. */
  shareToken: string | null;
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

  const earlier = attempts.filter((a) => a.attemptNo !== result.attemptNo).reverse();

  return (
    <div className="pltq-result flex flex-col gap-8">
      <ResultBody result={result} headingRef={headingRef} />
      {shareToken && <ResultActions shareToken={shareToken} />}

      {earlier.length > 0 && (
        <section aria-labelledby="earlier" className="no-print flex flex-col gap-3">
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
        <div className="no-print flex flex-col items-start gap-2">
          {error && (
            <p role="alert" className="pltq-error font-medium text-danger">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={onRetake}
            disabled={restarting}
            className="pltq-button rounded-md border border-border bg-surface px-5 py-2.5 font-medium hover:bg-border/40 disabled:opacity-60"
          >
            {restarting ? "Starting over…" : "Take it again"}
          </button>
          <p className="text-sm text-muted">This result stays saved.</p>
        </div>
      )}
    </div>
  );
}
