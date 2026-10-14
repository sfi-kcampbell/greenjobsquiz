"use client";

import { useState, useTransition } from "react";
import { restoreVersionAction, setQuizStatusAction } from "../actions";

export type LatestVersion = { number: number; publishedAt: string; publishedBy: string | null } | null;

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

export function PublishControl({
  quizId,
  status,
  healthWarnings,
  apiUrl,
  pageUrl,
  latest,
  changes,
}: {
  quizId: number;
  status: "draft" | "published";
  healthWarnings: number;
  apiUrl: string;
  pageUrl: string;
  /** The newest published version, if any. */
  latest: LatestVersion;
  /** What the draft changes since `latest` (empty: nothing to publish). */
  changes: string[];
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const published = status === "published";
  const pendingChanges = latest !== null && changes.length > 0;

  function confirmHealth(prompt: string) {
    return window.confirm(
      healthWarnings > 0 ? `Publish anyway? The Health tab shows ${healthWarnings} ${healthWarnings === 1 ? "warning" : "warnings"}.` : prompt,
    );
  }

  function change(next: "draft" | "published") {
    if (next === "published") {
      if (!confirmHealth(pendingChanges ? "Publish these changes? New attempts get them straight away." : "Publish this quiz? It will be available to the public.")) return;
    } else if (!window.confirm("Unpublish this quiz? It will stop being available. Submissions are kept.")) {
      return;
    }
    start(async () => {
      const result = await setQuizStatusAction(quizId, next, note);
      setMessage(result.error ?? result.message ?? null);
      if (!result.error) setNote("");
    });
  }

  function discard() {
    if (!latest || !window.confirm(`Discard the unpublished changes? The draft goes back to version ${latest.number}.`)) return;
    start(async () => {
      const result = await restoreVersionAction(quizId, latest.number);
      setMessage(result.error ?? "Changes discarded.");
    });
  }

  const primary = "rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-strong disabled:opacity-60";
  const secondary = "rounded-md border border-border px-4 py-2 font-medium hover:bg-border/40 disabled:opacity-60";

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
        {latest && (
          <span className="text-muted">
            {" "}
            {published ? "Live" : "Last published"}: version {latest.number}, {when(latest.publishedAt)} UTC
            {latest.publishedBy ? ` by ${latest.publishedBy}` : ""}.
          </span>
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

      {pendingChanges && (
        <div className="flex flex-col gap-2 rounded-md border border-amber-600/40 bg-amber-50 p-3 text-amber-950" aria-labelledby="draft-changes-heading">
          <p id="draft-changes-heading" className="font-semibold">
            Unpublished changes
          </p>
          <p>
            {published
              ? "People taking the quiz still see version " + latest.number + ". These changes go live when you publish them:"
              : "Changes since version " + latest.number + ":"}
          </p>
          <ul className="list-disc pl-5">
            {changes.slice(0, 12).map((c) => (
              <li key={c}>{c}</li>
            ))}
            {changes.length > 12 && <li>…and {changes.length - 12} more</li>}
          </ul>
          <p className="text-amber-900">Try the draft in the builder&apos;s Simulate tab before publishing.</p>
        </div>
      )}

      {(!published || pendingChanges) && (
        <div className="flex flex-col gap-1">
          <label htmlFor="publish-note" className="font-medium">
            Note for this version (optional)
          </label>
          <input
            id="publish-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={300}
            placeholder="What changed, for the version history"
            className="max-w-xl rounded-md border border-border bg-surface px-2 py-1.5"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {published ? (
          <>
            {pendingChanges && (
              <>
                <button type="button" onClick={() => change("published")} disabled={pending} className={primary}>
                  {pending ? "Publishing…" : "Publish changes"}
                </button>
                <button type="button" onClick={discard} disabled={pending} className={secondary}>
                  Discard changes
                </button>
              </>
            )}
            <button type="button" onClick={() => change("draft")} disabled={pending} className={secondary}>
              Unpublish
            </button>
          </>
        ) : (
          <button type="button" onClick={() => change("published")} disabled={pending} className={primary}>
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
