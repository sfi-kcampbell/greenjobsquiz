"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { duplicateQuizAction } from "./actions";

/** "Import a quiz file" on the quiz list: uploads, then opens the new draft. */
export function ImportQuizForm() {
  const router = useRouter();
  const [status, setStatus] = useState<{ busy?: boolean; error?: string }>({});

  return (
    <form
      className="flex flex-col gap-2 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const input = e.currentTarget.elements.namedItem("file") as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return setStatus({ error: "Choose a quiz file (.quiz.json) to import." });
        setStatus({ busy: true });
        const body = new FormData();
        body.append("file", file);
        try {
          const res = await fetch("/api/admin/quizzes/import", { method: "POST", body });
          const data = await res.json().catch(() => null);
          if (!res.ok) return setStatus({ error: data?.error ?? "The quiz couldn't be imported." });
          router.push(data.url);
        } catch {
          setStatus({ error: "The upload didn't reach the server. Check your connection and try again." });
        }
      }}
    >
      <label htmlFor="import-file" className="font-medium">
        Quiz file
      </label>
      <p id="import-file-hint" className="text-muted">
        A <code>.quiz.json</code> file from Export (on a quiz&apos;s settings page). It becomes a new draft; nothing
        existing changes.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input id="import-file" name="file" type="file" accept=".json,application/json" aria-describedby="import-file-hint import-status" />
        <button
          type="submit"
          disabled={status.busy}
          className="rounded-md border border-border px-4 py-2 font-medium hover:bg-border/40 disabled:opacity-60"
        >
          {status.busy ? "Importing…" : "Import"}
        </button>
      </div>
      <p id="import-status" role="status" className="text-danger">
        {status.error ?? ""}
      </p>
    </form>
  );
}

/** Copies the quiz as a draft, then opens the copy. */
export function DuplicateQuizButton({ quizId, title, className }: { quizId: number; title: string; className?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        aria-label={`Duplicate ${title}`}
        onClick={() =>
          start(async () => {
            const result = await duplicateQuizAction(quizId);
            if (result?.error) setError(result.error);
          })
        }
        className={className ?? "text-brand underline underline-offset-4 disabled:opacity-60"}
      >
        {pending ? "Duplicating…" : "Duplicate"}
      </button>
      {error && (
        <span role="alert" className="text-danger">
          {error}
        </span>
      )}
    </>
  );
}
