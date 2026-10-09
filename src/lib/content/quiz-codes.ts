/** Quiz codes in the database: admin CRUD, resolving a code, and the teacher report. */
import { randomBytes, randomInt } from "node:crypto";
import { and, asc, count, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Executor } from "@/lib/db/create";
import { quizCodes, quizSessions, quizzes, submissions } from "@/lib/db/schema";
import { hashToken, isToken, reportTokenFor } from "@/lib/public/tokens";
import { ContentError, pgError } from "./errors";
import { codeStatus, normalizeCode, CODE_PATTERN, REPORT_MIN_FINISHED, type CodeInput, type CodeStatus } from "./quiz-code-rules";

const PG_UNIQUE_VIOLATION = "23505";

/** No 0/O or 1/I/L in suggested codes, so they read out cleanly. */
const SUGGEST_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function suggestCode(length = 6): string {
  return Array.from({ length }, () => SUGGEST_ALPHABET[randomInt(SUGGEST_ALPHABET.length)]).join("");
}

const newSalt = () => randomBytes(16).toString("hex");
const reportColumns = (id: number, salt: string) => ({ reportSalt: salt, reportHash: hashToken(reportTokenFor(id, salt)) });

/* ---------------------------------- Admin --------------------------------- */

export async function createCode(db: Executor, quizId: number, input: CodeInput, createdBy: string): Promise<number> {
  try {
    // The hash needs the id, so insert with a placeholder and fill it in.
    const placeholder = newSalt();
    const [row] = await db
      .insert(quizCodes)
      .values({
        quizId,
        code: input.code,
        label: input.label,
        opensAt: input.opensOn,
        closesAt: input.closesOn,
        reportSalt: placeholder,
        reportHash: hashToken(`pending:${placeholder}`),
        createdBy,
      })
      .returning({ id: quizCodes.id });
    await db.update(quizCodes).set(reportColumns(row.id, newSalt())).where(eq(quizCodes.id, row.id));
    return row.id;
  } catch (error) {
    if (pgError(error)?.code === PG_UNIQUE_VIOLATION) {
      throw new ContentError("conflict", "That code is already used. Codes are shared across all quizzes; try another.", "code");
    }
    throw error;
  }
}

async function owned(db: Executor, quizId: number, codeId: number) {
  const [row] = await db
    .select()
    .from(quizCodes)
    .where(and(eq(quizCodes.id, codeId), eq(quizCodes.quizId, quizId)))
    .limit(1);
  if (!row) throw new ContentError("not_found", "That code no longer exists.");
  return row;
}

export async function updateCode(
  db: Executor,
  quizId: number,
  codeId: number,
  input: { label: string | null; opensOn: Date | null; closesOn: Date | null },
) {
  const row = await owned(db, quizId, codeId);
  await db.update(quizCodes).set({ label: input.label, opensAt: input.opensOn, closesAt: input.closesOn }).where(eq(quizCodes.id, codeId));
  return row.code;
}

export async function setCodeArchived(db: Executor, quizId: number, codeId: number, archived: boolean) {
  const row = await owned(db, quizId, codeId);
  await db.update(quizCodes).set({ archivedAt: archived ? new Date() : null }).where(eq(quizCodes.id, codeId));
  return row.code;
}

/** A new teacher link; the old one stops working. */
export async function resetReportLink(db: Executor, quizId: number, codeId: number) {
  const row = await owned(db, quizId, codeId);
  await db.update(quizCodes).set(reportColumns(codeId, newSalt())).where(eq(quizCodes.id, codeId));
  return row.code;
}

export type CodeRow = {
  id: number;
  code: string;
  label: string | null;
  opensAt: Date | null;
  closesAt: Date | null;
  archivedAt: Date | null;
  status: CodeStatus;
  started: number;
  finished: number;
  reportToken: string;
};

export async function listCodes(db: Executor, quizId: number): Promise<CodeRow[]> {
  const rows = await db.select().from(quizCodes).where(eq(quizCodes.quizId, quizId)).orderBy(asc(quizCodes.createdAt), asc(quizCodes.id));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const started = await db
    .select({ id: quizSessions.codeId, n: count() })
    .from(quizSessions)
    .where(inArray(quizSessions.codeId, ids))
    .groupBy(quizSessions.codeId);
  const finished = await db
    .select({ id: submissions.codeId, n: count() })
    .from(submissions)
    .where(inArray(submissions.codeId, ids))
    .groupBy(submissions.codeId);
  const s = new Map(started.map((r) => [r.id, r.n]));
  const f = new Map(finished.map((r) => [r.id, r.n]));
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    label: r.label,
    opensAt: r.opensAt,
    closesAt: r.closesAt,
    archivedAt: r.archivedAt,
    status: codeStatus(r),
    started: s.get(r.id) ?? 0,
    finished: f.get(r.id) ?? 0,
    reportToken: reportTokenFor(r.id, r.reportSalt),
  }));
}

/** Codes that appear on this quiz's submissions (for the Submissions filter). */
export async function codeOptions(db: Executor, quizId: number): Promise<{ id: number; title: string }[]> {
  const rows = await db.select({ id: quizCodes.id, code: quizCodes.code, label: quizCodes.label }).from(quizCodes).where(eq(quizCodes.quizId, quizId)).orderBy(asc(quizCodes.code));
  return rows.map((r) => ({ id: r.id, title: r.label ? `${r.code} (${r.label})` : r.code }));
}

/* -------------------------------- Respondents ----------------------------- */

export type CodeProblem = "not_found" | "not_open_yet" | "closed";
export type ResolvedCode =
  | { ok: true; codeId: number; code: string }
  | { ok: false; reason: CodeProblem; opensAt?: Date | null };

export const CODE_MESSAGES: Record<CodeProblem, string> = {
  not_found: "That code isn't recognized. Check it and try again.",
  not_open_yet: "That code isn't open yet.",
  closed: "That code has closed.",
};

/** Whether `input` is a usable code for this quiz right now. */
export async function resolveCode(db: Executor, quizId: number, input: string, now = new Date()): Promise<ResolvedCode> {
  const code = normalizeCode(input);
  if (!CODE_PATTERN.test(code)) return { ok: false, reason: "not_found" };
  const [row] = await db
    .select()
    .from(quizCodes)
    .where(and(eq(quizCodes.code, code), eq(quizCodes.quizId, quizId)))
    .limit(1);
  return judge(row, now);
}

function judge(row: typeof quizCodes.$inferSelect | undefined, now: Date): ResolvedCode {
  if (!row) return { ok: false, reason: "not_found" };
  const status = codeStatus(row, now);
  if (status === "archived") return { ok: false, reason: "closed" };
  if (status === "scheduled") return { ok: false, reason: "not_open_yet", opensAt: row.opensAt };
  if (status === "closed") return { ok: false, reason: "closed" };
  return { ok: true, codeId: row.id, code: row.code };
}

/** For /q/{code}: the code and where it leads (any quiz). */
export async function lookupShortCode(db: Executor, input: string, now = new Date()) {
  const code = normalizeCode(input);
  if (!CODE_PATTERN.test(code)) return { resolved: { ok: false, reason: "not_found" } as ResolvedCode, quiz: null };
  const [row] = await db
    .select({
      c: quizCodes,
      slug: quizzes.slug,
      title: quizzes.title,
      status: quizzes.status,
      deliveryMode: quizzes.deliveryMode,
      headlessBaseUrl: quizzes.headlessBaseUrl,
    })
    .from(quizCodes)
    .innerJoin(quizzes, eq(quizzes.id, quizCodes.quizId))
    .where(eq(quizCodes.code, code))
    .limit(1);
  if (!row || row.status !== "published") return { resolved: { ok: false, reason: "not_found" } as ResolvedCode, quiz: null };
  return { resolved: judge(row.c, now), quiz: { slug: row.slug, title: row.title, deliveryMode: row.deliveryMode, headlessBaseUrl: row.headlessBaseUrl } };
}

/* ------------------------------ Teacher report ---------------------------- */

type StoredScores = { categories: Record<string, { raw: number; max: number; label: string; color: string }> };

export type CodeReport = {
  quiz: { id: number; title: string };
  code: { code: string; label: string | null; opensAt: Date | null; closesAt: Date | null };
  started: number;
  finished: number;
  /** Null until REPORT_MIN_FINISHED people have finished. */
  summary: {
    responses: { title: string; count: number; percent: number }[];
    profile: { label: string; color: string; percent: number }[];
  } | null;
};

const shareOfMax = (raw: number, max: number) => (max > 0 ? Math.max(0, Math.min(1, raw / max)) : 0);

export async function codeReport(db: Executor, token: string): Promise<CodeReport | null> {
  if (!isToken(token)) return null;
  const [row] = await db
    .select({ c: quizCodes, title: quizzes.title })
    .from(quizCodes)
    .innerJoin(quizzes, eq(quizzes.id, quizCodes.quizId))
    .where(eq(quizCodes.reportHash, hashToken(token)))
    .limit(1);
  if (!row) return null;
  const c = row.c;
  const [{ started }] = await db.select({ started: count() }).from(quizSessions).where(eq(quizSessions.codeId, c.id));
  const subs = await db
    .select({ resultTitle: submissions.resultTitle, scores: submissions.scores })
    .from(submissions)
    .where(and(eq(submissions.codeId, c.id), isNotNull(submissions.id)));
  const finished = subs.length;

  let summary: CodeReport["summary"] = null;
  if (finished >= REPORT_MIN_FINISHED) {
    const byTitle = new Map<string, number>();
    for (const s of subs) {
      const t = s.resultTitle ?? "No clear match";
      byTitle.set(t, (byTitle.get(t) ?? 0) + 1);
    }
    const responses = [...byTitle.entries()]
      .map(([title, n]) => ({ title, count: n, percent: Math.round((100 * n) / finished) }))
      .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));

    // Average each category's share of its maximum; label and colour from the latest snapshot.
    const totals = new Map<string, { sum: number; label: string; color: string }>();
    for (const s of subs) {
      for (const [id, v] of Object.entries((s.scores as StoredScores).categories ?? {})) {
        const t = totals.get(id) ?? { sum: 0, label: v.label, color: v.color };
        t.sum += shareOfMax(v.raw, v.max);
        t.label = v.label;
        t.color = v.color;
        totals.set(id, t);
      }
    }
    const profile = [...totals.values()]
      .map((t) => ({ label: t.label, color: t.color, percent: Math.round((100 * t.sum) / finished) }))
      .sort((a, b) => b.percent - a.percent || a.label.localeCompare(b.label));
    summary = { responses, profile };
  }

  return {
    quiz: { id: c.quizId, title: row.title },
    code: { code: c.code, label: c.label, opensAt: c.opensAt, closesAt: c.closesAt },
    started,
    finished,
    summary,
  };
}

/** Used by tests and the quiz toggle. */
export async function setRequireCode(db: Executor, quizId: number, required: boolean) {
  await db
    .update(quizzes)
    .set({ requireCode: required, structureVersion: sql`${quizzes.structureVersion} + 1` })
    .where(eq(quizzes.id, quizId));
}
