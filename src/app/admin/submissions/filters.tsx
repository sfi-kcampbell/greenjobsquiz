"use client";

import Link from "next/link";
import { useRef } from "react";

type Option = { id: number; title: string };

/**
 * A plain GET form: every filter lives in the URL, so reloads, bookmarks and
 * the back button keep them. Choosing a quiz submits straight away so the
 * response list can follow.
 */
export function Filters({
  values,
  quizOptions,
  responseOptions,
  codeOptions,
}: {
  values: { quiz?: number; response?: number; code?: number; from?: string; to?: string; q?: string; sort: string; dir: string; per: number };
  quizOptions: Option[];
  responseOptions: Option[];
  codeOptions: Option[];
}) {
  const form = useRef<HTMLFormElement>(null);
  const field = "rounded-md border border-border bg-surface px-2 py-1.5";
  return (
    <form ref={form} method="get" role="search" aria-label="Filter submissions" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4 text-sm">
      {/* Keep the current sort and page size; defaults stay out of the URL. */}
      {!(values.sort === "date" && values.dir === "desc") && (
        <>
          <input type="hidden" name="sort" value={values.sort} />
          <input type="hidden" name="dir" value={values.dir} />
        </>
      )}
      {values.per !== 25 && <input type="hidden" name="per" value={values.per} />}
      <div className="flex flex-col gap-1">
        <label htmlFor="f-quiz" className="font-medium">
          Quiz
        </label>
        <select
          id="f-quiz"
          name="quiz"
          defaultValue={values.quiz ?? ""}
          className={field}
          onChange={() => {
            const response = form.current?.elements.namedItem("response");
            if (response instanceof HTMLSelectElement) response.value = "";
            const code = form.current?.elements.namedItem("code");
            if (code instanceof HTMLSelectElement) code.value = "";
            form.current?.requestSubmit();
          }}
        >
          <option value="">All quizzes</option>
          {quizOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title}
            </option>
          ))}
        </select>
      </div>
      {values.quiz && (
        <div className="flex flex-col gap-1">
          <label htmlFor="f-response" className="font-medium">
            Matched response
          </label>
          <select id="f-response" name="response" defaultValue={values.response ?? ""} className={field}>
            <option value="">Any response</option>
            {responseOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </select>
        </div>
      )}
      {values.quiz && codeOptions.length > 0 && (
        <div className="flex flex-col gap-1">
          <label htmlFor="f-code" className="font-medium">
            Quiz code
          </label>
          <select id="f-code" name="code" defaultValue={values.code ?? ""} className={field}>
            <option value="">Any code</option>
            {codeOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="f-from" className="font-medium">
          From
        </label>
        <input id="f-from" name="from" type="date" defaultValue={values.from} className={field} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="f-to" className="font-medium">
          To
        </label>
        <input id="f-to" name="to" type="date" defaultValue={values.to} className={field} />
      </div>
      <div className="flex min-w-48 flex-1 flex-col gap-1">
        <label htmlFor="f-q" className="font-medium">
          Search
        </label>
        <input id="f-q" name="q" type="search" defaultValue={values.q} placeholder="Email or response" maxLength={100} className={field} />
      </div>
      <div className="flex gap-2">
        <button type="submit" className="rounded-md bg-brand px-4 py-1.5 font-medium text-white hover:bg-brand-strong">
          Apply
        </button>
        <Link href="/admin/submissions" className="rounded-md border border-border px-4 py-1.5 font-medium hover:bg-border/40">
          Clear
        </Link>
      </div>
    </form>
  );
}
