"use client";

import { useEffect, useRef } from "react";

/** "You're 3 of 10 through." Resume or start a new attempt. */
export function ResumeView({
  answered,
  total,
  busy,
  error,
  onResume,
  onStartOver,
}: {
  answered: number;
  total: number;
  busy: boolean;
  error: string | null;
  onResume: () => void;
  onStartOver: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6">
      <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold focus:outline-none">
        Welcome back
      </h2>
      <p>
        You&apos;re {answered} of {total} through. Pick up where you left off, or start again.
      </p>
      {error && (
        <p role="alert" className="pltq-error font-medium text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onResume}
          disabled={busy}
          className="pltq-button pltq-button--primary rounded-md border border-transparent bg-brand px-6 py-2.5 font-medium text-white hover:bg-brand-strong disabled:opacity-60"
        >
          Resume
        </button>
        <button
          type="button"
          onClick={onStartOver}
          disabled={busy}
          className="pltq-button rounded-md border border-border px-6 py-2.5 font-medium hover:bg-border/40 disabled:opacity-60"
        >
          {busy ? "Starting over…" : "Start over"}
        </button>
      </div>
    </div>
  );
}
