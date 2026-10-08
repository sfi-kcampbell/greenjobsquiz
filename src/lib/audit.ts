/**
 * The activity log (who changed what, and when). Server actions record an
 * event after each successful change. Never pass secrets, CSS bodies or
 * respondent emails in `details`.
 */
import { and, count, desc, eq, gte, lt, type SQL } from "drizzle-orm";
import type { Executor } from "@/lib/db/create";
import { auditEvents, quizzes } from "@/lib/db/schema";

export type AuditScope = "quiz" | "staff" | "settings" | "submissions";
export type AuditEventInput = {
  scope: AuditScope;
  action: string;
  summary: string;
  quizId?: number | null;
  /** Defaults to the quiz's current title. */
  quizTitle?: string | null;
  details?: Record<string, unknown> | null;
};

export async function recordAudit(db: Executor, actor: { email: string }, event: AuditEventInput): Promise<void> {
  let quizTitle = event.quizTitle ?? null;
  if (event.quizId && quizTitle === null) {
    const [q] = await db.select({ title: quizzes.title }).from(quizzes).where(eq(quizzes.id, event.quizId)).limit(1);
    quizTitle = q?.title ?? null;
  }
  await db.insert(auditEvents).values({
    actorEmail: actor.email,
    scope: event.scope,
    action: event.action,
    quizId: event.quizId ?? null,
    quizTitle,
    summary: event.summary.slice(0, 500),
    details: event.details ?? null,
  });
}

export const AUDIT_PAGE_SIZE = 50;

export type AuditQuery = {
  /** Admins only see quiz events. */
  superAdmin: boolean;
  quizId?: number | null;
  actor?: string | null;
  scope?: AuditScope | null;
  /** Inclusive UTC dates, YYYY-MM-DD. */
  from?: string | null;
  to?: string | null;
  page?: number;
  pageSize?: number;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function listAudit(db: Executor, q: AuditQuery) {
  const where: SQL[] = [];
  if (!q.superAdmin) where.push(eq(auditEvents.scope, "quiz"));
  if (q.scope) where.push(eq(auditEvents.scope, q.scope));
  if (q.quizId) where.push(eq(auditEvents.quizId, q.quizId));
  if (q.actor) where.push(eq(auditEvents.actorEmail, q.actor.trim().toLowerCase()));
  if (q.from && DATE.test(q.from)) where.push(gte(auditEvents.at, new Date(`${q.from}T00:00:00Z`)));
  if (q.to && DATE.test(q.to)) where.push(lt(auditEvents.at, new Date(new Date(`${q.to}T00:00:00Z`).getTime() + 86_400_000)));
  const filter = where.length ? and(...where) : undefined;
  const size = q.pageSize ?? AUDIT_PAGE_SIZE;
  const page = Math.max(1, q.page ?? 1);
  const [{ total }] = await db.select({ total: count() }).from(auditEvents).where(filter);
  const rows = await db
    .select()
    .from(auditEvents)
    .where(filter)
    .orderBy(desc(auditEvents.at), desc(auditEvents.id))
    .limit(size)
    .offset((page - 1) * size);
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / size)) };
}

/** People who appear in the log (for the filter). */
export async function auditActors(db: Executor, superAdmin: boolean): Promise<string[]> {
  const rows = await db
    .selectDistinct({ email: auditEvents.actorEmail })
    .from(auditEvents)
    .where(superAdmin ? undefined : eq(auditEvents.scope, "quiz"))
    .orderBy(auditEvents.actorEmail);
  return rows.map((r) => r.email);
}
