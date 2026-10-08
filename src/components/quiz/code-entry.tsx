"use client";

import { useId, useState } from "react";

/** "Quiz code" box shown instead of Start when a quiz needs a code. */
export function CodeEntry({
  check,
  initialError,
}: {
  /** Resolves to an error message, or null when the code was accepted. */
  check: (code: string) => Promise<string | null>;
  initialError?: string | null;
}) {
  const id = useId();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!value.trim()) return setError("Enter your quiz code.");
        setBusy(true);
        setError(await check(value.trim()));
        setBusy(false);
      }}
    >
      <label htmlFor={id} className="font-medium">
        Quiz code
      </label>
      <p id={`${id}-hint`} className="text-sm text-muted">
        This quiz needs a code. You&apos;ll find it on your mailer, flyer or from your teacher.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          id={id}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={40}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
          className="w-48 rounded-md border border-border bg-surface px-3 py-2 font-mono text-lg uppercase tracking-wider"
        />
        <button
          type="submit"
          disabled={busy}
          className="pltq-button pltq-button--primary rounded-md border border-transparent bg-brand px-6 py-2.5 font-medium text-white hover:bg-brand-strong disabled:opacity-60"
        >
          {busy ? "Checking…" : "Continue"}
        </button>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="pltq-error font-medium text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
