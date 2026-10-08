import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { AuditList } from "@/components/audit-list";
import { requireStaff } from "@/lib/auth/access";
import { auditActors, listAudit, type AuditScope } from "@/lib/audit";
import { db } from "@/lib/db/client";
import { quizzes } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Activity" };

const SCOPES: { value: AuditScope; label: string }[] = [
  { value: "quiz", label: "Quizzes" },
  { value: "staff", label: "Staff" },
  { value: "settings", label: "Settings" },
  { value: "submissions", label: "Submissions" },
];

const one = (v: string | string[] | undefined) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export default async function ActivityPage({ searchParams }: PageProps<"/admin/activity">) {
  const staff = await requireStaff();
  const superAdmin = staff.role === "super_admin";
  const sp = await searchParams;
  const quiz = Number(one(sp.quiz)) || undefined;
  const actor = one(sp.who);
  const scope = superAdmin ? SCOPES.find((s) => s.value === one(sp.type))?.value : undefined;
  const from = one(sp.from);
  const to = one(sp.to);
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const [{ rows, total, pageCount }, actors, quizOptions] = await Promise.all([
    listAudit(db, { superAdmin, quizId: quiz, actor, scope, from, to, page }),
    auditActors(db, superAdmin),
    db.select({ id: quizzes.id, title: quizzes.title }).from(quizzes).orderBy(asc(quizzes.title)),
  ]);

  const params = new URLSearchParams(
    Object.entries({ quiz: quiz ? String(quiz) : undefined, who: actor, type: scope, from, to }).filter((e): e is [string, string] => Boolean(e[1])),
  );
  const pageHref = (n: number) => {
    const p = new URLSearchParams(params);
    if (n > 1) p.set("page", String(n));
    return `/admin/activity${p.size ? `?${p}` : ""}`;
  };
  const field = "rounded-md border border-border bg-surface px-2 py-1.5";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Activity</h1>
        <p className="mt-1 text-sm text-muted">
          Who changed what, and when.{" "}
          {superAdmin ? "Includes staff, settings and submission changes." : "Quiz changes only."}
        </p>
      </div>

      <form method="get" role="search" aria-label="Filter activity" className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4 text-sm">
        <div className="flex flex-col gap-1">
          <label htmlFor="a-quiz" className="font-medium">Quiz</label>
          <select id="a-quiz" name="quiz" defaultValue={quiz ?? ""} className={field}>
            <option value="">All quizzes</option>
            {quizOptions.map((q) => (
              <option key={q.id} value={q.id}>{q.title}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="a-who" className="font-medium">Person</label>
          <select id="a-who" name="who" defaultValue={actor ?? ""} className={field}>
            <option value="">Everyone</option>
            {actors.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        {superAdmin && (
          <div className="flex flex-col gap-1">
            <label htmlFor="a-type" className="font-medium">Type</label>
            <select id="a-type" name="type" defaultValue={scope ?? ""} className={field}>
              <option value="">All types</option>
              {SCOPES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex flex-col gap-1">
          <label htmlFor="a-from" className="font-medium">From (UTC)</label>
          <input id="a-from" name="from" type="date" defaultValue={from} className={field} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="a-to" className="font-medium">To (UTC)</label>
          <input id="a-to" name="to" type="date" defaultValue={to} className={field} />
        </div>
        <button type="submit" className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-strong">
          Filter
        </button>
        {params.size > 0 && (
          <Link href="/admin/activity" className="py-2 text-brand underline underline-offset-4">
            Clear
          </Link>
        )}
      </form>

      <p role="status" className="text-sm text-muted">
        {total.toLocaleString("en")} event{total === 1 ? "" : "s"}
      </p>
      <AuditList rows={rows} />

      {pageCount > 1 && (
        <nav aria-label="Pages" className="flex items-center gap-4 text-sm">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className="text-brand underline underline-offset-4">Newer</Link>
          ) : (
            <span className="text-muted">Newer</span>
          )}
          <span>
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Link href={pageHref(page + 1)} className="text-brand underline underline-offset-4">Older</Link>
          ) : (
            <span className="text-muted">Older</span>
          )}
        </nav>
      )}
    </div>
  );
}
