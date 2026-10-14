"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { restoreVersionAction } from "../actions";

type Version = {
  number: number;
  publishedAt: string;
  publishedBy: string | null;
  note: string | null;
  questions: number;
  responses: number;
  finished: number;
};

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

/** Published versions, newest first: view, compare, restore to the draft. */
export function VersionsSection({ quizId, versions }: { quizId: number; versions: Version[] }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="max-w-2xl text-muted">
        Each publish saves a version. People part-way through a quiz finish on the version they started. Restoring a
        version copies it into the draft; publish to make it live.
      </p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left">
          <thead className="border-b border-border text-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Version</th>
              <th scope="col" className="px-3 py-2 font-medium">Published (UTC)</th>
              <th scope="col" className="px-3 py-2 font-medium">By</th>
              <th scope="col" className="px-3 py-2 font-medium">Note</th>
              <th scope="col" className="px-3 py-2 font-medium">Content</th>
              <th scope="col" className="px-3 py-2 font-medium">Finished</th>
              <th scope="col" className="px-3 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {versions.map((v, i) => (
              <tr key={v.number}>
                <td className="px-3 py-2 font-medium">
                  {v.number}
                  {i === 0 && <span className="ml-2 rounded bg-brand/10 px-1.5 py-0.5 text-xs text-brand">latest</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2">{when(v.publishedAt)}</td>
                <td className="px-3 py-2">{v.publishedBy ?? <span className="text-muted">—</span>}</td>
                <td className="px-3 py-2">{v.note ?? <span className="text-muted">—</span>}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                  {v.questions} questions, {v.responses} responses
                </td>
                <td className="px-3 py-2 tabular-nums">{v.finished}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-3">
                    <Link href={`/admin/quizzes/${quizId}/versions/${v.number}`} className="text-brand underline underline-offset-4">
                      View<span className="sr-only"> version {v.number}</span>
                    </Link>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (!window.confirm(`Copy version ${v.number} into the draft? Unpublished changes are replaced. Publish afterwards to make it live.`)) return;
                        start(async () => setMessage((await restoreVersionAction(quizId, v.number)).message ?? null));
                      }}
                      className="text-brand underline underline-offset-4 disabled:opacity-60"
                    >
                      Restore to draft<span className="sr-only"> (version {v.number})</span>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p role="status" className="text-brand">
        {message ?? ""}
      </p>
    </div>
  );
}
