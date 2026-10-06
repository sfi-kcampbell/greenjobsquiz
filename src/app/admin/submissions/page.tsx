import type { Metadata } from "next";
import Link from "next/link";
import { listFilterOptions, listSubmissions, PAGE_SIZES, parseListQuery, type SortKey } from "@/lib/admin/submissions";
import { requireSuperAdmin } from "@/lib/auth/access";
import { db } from "@/lib/db/client";
import { BulkTable, type Column, type Row } from "./bulk-table";
import { Filters } from "./filters";
import { dateTime, duration, listQueryString } from "./format";

export const metadata: Metadata = { title: "Submissions" };

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "attempt", label: "Attempt" },
  { key: "date", label: "Date (UTC)" },
  { key: "quiz", label: "Quiz" },
  { key: "respondent", label: "Respondent" },
  { key: "match", label: "Matched response" },
  { key: "score", label: "Score" },
];

export default async function SubmissionsPage({ searchParams }: PageProps<"/admin/submissions">) {
  await requireSuperAdmin();
  const query = parseListQuery(await searchParams);
  const [{ rows, total, page, pages, per }, { quizOptions, responseOptions }] = await Promise.all([
    listSubmissions(db, query),
    listFilterOptions(db, query.quiz),
  ]);

  // The current state as URL params (page 1 is the default, so it's left out).
  // Defaults (newest first, 25 per page) stay out of the URL.
  const isDefaultSort = query.sort === "date" && query.dir === "desc";
  const state = {
    quiz: query.quiz,
    response: query.response,
    from: query.from,
    to: query.to,
    q: query.q,
    sort: isDefaultSort ? undefined : query.sort,
    dir: isDefaultSort ? undefined : query.dir,
    per: query.per === 25 ? undefined : query.per,
  };
  const here = listQueryString({ ...state, page: page > 1 ? page : undefined });
  const sortHref = (key: SortKey) =>
    `/admin/submissions${listQueryString(state, { sort: key, dir: query.sort === key && query.dir === "desc" ? "asc" : "desc", page: undefined })}`;
  const columns: Column[] = [
    ...COLUMNS.map((c) => ({
      key: c.key,
      label: c.label,
      href: sortHref(c.key),
      sort: (query.sort === c.key ? (query.dir === "asc" ? "ascending" : "descending") : "none") as Column["sort"],
    })),
    { key: "top", label: "Top category", href: null, sort: "none" },
    { key: "answered", label: "Answered", href: sortHref("answered"), sort: query.sort === "answered" ? (query.dir === "asc" ? "ascending" : "descending") : "none" },
    { key: "time", label: "Time", href: sortHref("time"), sort: query.sort === "time" ? (query.dir === "asc" ? "ascending" : "descending") : "none" },
  ];
  const tableRows: Row[] = rows.map((r) => ({
    id: r.id,
    attemptNo: r.attemptNo,
    date: dateTime.format(r.createdAt),
    quizTitle: r.quizTitle,
    respondent: r.email ?? "Anonymous",
    anonymous: !r.email,
    resultTitle: r.resultTitle,
    percent: r.percent,
    topCategory: r.topCategory,
    answered: `${r.questionsAnswered}/${r.questionTotal}`,
    time: duration(r.durationSeconds),
    suspect: r.suspect,
  }));
  const filtered = Boolean(query.quiz || query.from || query.to || query.q);
  const first = total === 0 ? 0 : (page - 1) * per + 1;
  const last = Math.min(total, page * per);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Submissions</h1>
      <Filters
        key={here} // remount on navigation so the inputs show the URL's values
        values={{ quiz: query.quiz, response: query.response, from: query.from, to: query.to, q: query.q, sort: query.sort, dir: query.dir, per: query.per }}
        quizOptions={quizOptions}
        responseOptions={responseOptions}
      />

      {total === 0 ? (
        <p className="text-muted">{filtered ? "No submissions match these filters." : "No submissions yet. They appear here when someone finishes a quiz."}</p>
      ) : (
        <>
          <BulkTable rows={tableRows} columns={columns} back={here} />
          <nav aria-label="Pages" className="flex flex-wrap items-center gap-4 text-sm">
            <p>
              Showing {first}–{last} of {total}
            </p>
            {page > 1 ? (
              <Link href={`/admin/submissions${listQueryString(state, { page: page - 1 > 1 ? page - 1 : undefined })}`} className="text-brand underline underline-offset-4">
                Previous
              </Link>
            ) : (
              <span className="text-muted">Previous</span>
            )}
            <span>
              Page {page} of {pages}
            </span>
            {page < pages ? (
              <Link href={`/admin/submissions${listQueryString(state, { page: page + 1 })}`} className="text-brand underline underline-offset-4">
                Next
              </Link>
            ) : (
              <span className="text-muted">Next</span>
            )}
            <span className="flex items-center gap-2">
              Rows per page:
              {PAGE_SIZES.map((n) =>
                n === per ? (
                  <strong key={n} aria-current="true">
                    {n}
                  </strong>
                ) : (
                  <Link key={n} href={`/admin/submissions${listQueryString(state, { per: n === 25 ? undefined : n, page: undefined })}`} className="text-brand underline underline-offset-4">
                    {n}
                  </Link>
                ),
              )}
            </span>
          </nav>
        </>
      )}
    </div>
  );
}
