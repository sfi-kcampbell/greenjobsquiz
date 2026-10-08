"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteSubmissionsAction } from "./actions";

export type Row = {
  id: number;
  attemptNo: number;
  date: string;
  quizTitle: string;
  respondent: string;
  anonymous: boolean;
  resultTitle: string | null;
  percent: number | null;
  topCategory: string | null;
  code: string | null;
  answered: string;
  time: string;
  suspect: boolean;
};

export type Column = { key: string; label: string; href: string | null; sort: "ascending" | "descending" | "none" };

/** The submissions table: sortable headers, row selection, View and Delete. */
export function BulkTable({ rows, columns, back }: { rows: Row[]; columns: Column[]; back: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const remove = (ids: number[]) => {
    if (!window.confirm(`Delete ${ids.length} submission${ids.length === 1 ? "" : "s"}? This can't be undone.`)) return;
    start(async () => {
      const res = await deleteSubmissionsAction(ids);
      setMessage(res.message);
      if (res.ok) {
        setSelected(new Set());
        router.refresh();
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          disabled={selected.size === 0 || pending}
          onClick={() => remove([...selected])}
          className="rounded-md border border-danger px-3 py-1.5 font-medium text-danger hover:bg-danger/5 disabled:opacity-50"
        >
          Delete selected{selected.size ? ` (${selected.size})` : ""}
        </button>
        <p role="status" className="text-brand">
          {pending ? "Deleting…" : message}
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Submissions. Column headers sort the table.</caption>
          <thead className="border-b border-border text-muted">
            <tr>
              <th scope="col" className="px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all on this page"
                  checked={allChecked}
                  onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                />
              </th>
              {columns.map((c) => (
                <th key={c.key} scope="col" aria-sort={c.sort} className="whitespace-nowrap px-3 py-2 font-medium">
                  {c.href ? (
                    <Link href={c.href} className="hover:text-foreground hover:underline">
                      {c.label}
                      {c.sort === "ascending" ? " ▲" : c.sort === "descending" ? " ▼" : ""}
                    </Link>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
              <th scope="col" className="px-3 py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Select submission ${r.id}`}
                    checked={selected.has(r.id)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(r.id);
                      else next.delete(r.id);
                      setSelected(next);
                    }}
                  />
                </td>
                <td className="px-3 py-2 tabular-nums">{r.attemptNo}</td>
                <td className="whitespace-nowrap px-3 py-2">{r.date}</td>
                <td className="px-3 py-2">{r.quizTitle}</td>
                <td className={`px-3 py-2 ${r.anonymous ? "text-muted" : ""}`}>{r.respondent}</td>
                <td className="px-3 py-2">{r.resultTitle ?? <span className="text-muted">No match</span>}</td>
                <td className="px-3 py-2">
                  {r.percent === null ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span aria-hidden className="meter-track block h-2 w-16 overflow-hidden rounded-full bg-border">
                        <span className="meter-fill block h-full rounded-full bg-brand" style={{ width: `${r.percent}%` }} />
                      </span>
                      <span className="tabular-nums">{r.percent}%</span>
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">{r.topCategory ?? <span className="text-muted">—</span>}</td>
                <td className="px-3 py-2 font-mono">{r.code ?? <span className="font-sans text-muted">—</span>}</td>
                <td className="px-3 py-2 tabular-nums">{r.answered}</td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                  {r.time}
                  {r.suspect && (
                    <span className="ml-1 rounded bg-danger/10 px-1 text-xs text-danger" title="Finished in under 3 seconds">
                      fast
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-3 whitespace-nowrap">
                    <Link href={`/admin/submissions/${r.id}?back=${encodeURIComponent(back)}`} className="text-brand hover:underline">
                      View<span className="sr-only"> submission {r.id}</span>
                    </Link>
                    <button type="button" disabled={pending} onClick={() => remove([r.id])} className="text-danger hover:underline disabled:opacity-50">
                      Delete<span className="sr-only"> submission {r.id}</span>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
