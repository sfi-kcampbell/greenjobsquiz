"use client";

import { useState, useTransition } from "react";
import { setQuizStatusAction } from "../actions";

export function PublishControl({
  quizId,
  status,
  healthWarnings,
  apiUrl,
  pageUrl,
}: {
  quizId: number;
  status: "draft" | "published";
  healthWarnings: number;
  apiUrl: string;
  pageUrl: string;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const published = status === "published";

  function change(next: "draft" | "published") {
    if (next === "published") {
      const prompt =
        healthWarnings > 0
          ? `Publish anyway? The Health tab shows ${healthWarnings} ${healthWarnings === 1 ? "warning" : "warnings"}.`
          : "Publish this quiz? It will be available to the public.";
      if (!window.confirm(prompt)) return;
    } else if (!window.confirm("Unpublish this quiz? It will stop being available. Submissions are kept.")) {
      return;
    }
    start(async () => {
      const result = await setQuizStatusAction(quizId, next);
      setMessage(result.error ?? result.message ?? null);
    });
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <p>
        {published ? (
          <>
            <strong className="text-brand">Published.</strong> Anyone can take this quiz.
          </>
        ) : (
          <>
            <strong>Draft.</strong> Only staff can see this quiz.
          </>
        )}
      </p>
      {published && (
        <>
          <p>
            <a href={pageUrl} target="_blank" rel="noopener noreferrer" className="text-brand underline underline-offset-4">
              View the quiz page
            </a>{" "}
            <span className="text-muted">({pageUrl})</span>
          </p>
          <p className="text-muted">
            Public API: <code className="break-all">{apiUrl}</code>
          </p>
        </>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {published ? (
          <button
            type="button"
            onClick={() => change("draft")}
            disabled={pending}
            className="rounded-md border border-border px-4 py-2 font-medium hover:bg-border/40 disabled:opacity-60"
          >
            {pending ? "Unpublishing…" : "Unpublish"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => change("published")}
            disabled={pending}
            className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-strong disabled:opacity-60"
          >
            {pending ? "Publishing…" : "Publish"}
          </button>
        )}
        {!published && healthWarnings > 0 && (
          <span className="text-amber-800">
            {healthWarnings} health {healthWarnings === 1 ? "warning" : "warnings"}
          </span>
        )}
        <p role="status" className="text-brand">
          {message ?? ""}
        </p>
      </div>
    </div>
  );
}
