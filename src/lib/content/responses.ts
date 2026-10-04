/**
 * Responses: the outcomes a quiz can recommend (e.g. Forester), each with
 * content and a weight in every category. Stored in the `results` table.
 */
import { and, asc, count, eq, inArray, isNull, max, sql } from "drizzle-orm";
import type { Database, Executor, Tx } from "@/lib/db/create";
import { categories, results, resultWeights, submissions } from "@/lib/db/schema";
import { sanitizeRichText } from "@/lib/sanitize/rich-text";
import { ContentError } from "./errors";
import { bumpStructureVersion, lockQuiz } from "./quizzes";
import { MAX_RESPONSES, type ResponseDetailsInput, type ResponseRowInput } from "./validation";

export type ResponseView = {
  id: number;
  title: string;
  excerpt: string | null;
  bodyHtml: string;
  ctaUrl: string | null;
  ctaLabel: string | null;
  position: number;
  /** categoryId → weight; zero weights are absent. */
  weights: Record<number, number>;
};

async function weightsFor(db: Executor, ids: number[]): Promise<Map<number, Record<number, number>>> {
  const map = new Map<number, Record<number, number>>();
  if (ids.length === 0) return map;
  const rows = await db.select().from(resultWeights).where(inArray(resultWeights.resultId, ids));
  for (const w of rows) {
    const weights = map.get(w.resultId) ?? {};
    weights[w.categoryId] = w.weight;
    map.set(w.resultId, weights);
  }
  return map;
}

function toView(r: typeof results.$inferSelect, weights: Record<number, number>): ResponseView {
  return {
    id: r.id,
    title: r.title,
    excerpt: r.excerpt,
    bodyHtml: r.bodyHtml,
    ctaUrl: r.ctaUrl,
    ctaLabel: r.ctaLabel,
    position: r.position,
    weights,
  };
}

export async function listResponses(db: Executor, quizId: number): Promise<ResponseView[]> {
  const rows = await db
    .select()
    .from(results)
    .where(and(eq(results.quizId, quizId), isNull(results.archivedAt)))
    .orderBy(asc(results.position), asc(results.id));
  const weights = await weightsFor(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => toView(r, weights.get(r.id) ?? {}));
}

export async function getResponse(db: Executor, quizId: number, id: number): Promise<ResponseView | null> {
  const [row] = await db
    .select()
    .from(results)
    .where(and(eq(results.id, id), eq(results.quizId, quizId), isNull(results.archivedAt)));
  if (!row) return null;
  return toView(row, (await weightsFor(db, [id])).get(id) ?? {});
}

/** Replaces a response's weights; only non-zero values are stored. */
async function replaceWeights(tx: Tx, quizId: number, resultId: number, weights: Record<string, number>) {
  const quizCategories = await tx.select({ id: categories.id }).from(categories).where(eq(categories.quizId, quizId));
  const valid = new Set(quizCategories.map((c) => c.id));
  for (const key of Object.keys(weights)) {
    if (!valid.has(Number(key))) {
      throw new ContentError("invalid", "A category was removed while you were editing. Reload and try again.");
    }
  }
  await tx.delete(resultWeights).where(eq(resultWeights.resultId, resultId));
  const rows = Object.entries(weights)
    .filter(([, w]) => w !== 0)
    .map(([categoryId, weight]) => ({ resultId, categoryId: Number(categoryId), weight }));
  if (rows.length) await tx.insert(resultWeights).values(rows);
}

/** Title and weights, from the Responses matrix. Creates the response if `id` is null. */
export async function saveResponseRow(db: Database, quizId: number, input: ResponseRowInput): Promise<number> {
  return db.transaction(async (tx) => {
    await lockQuiz(tx, quizId);
    let id: number;
    if (input.id === null) {
      const [{ n }] = await tx
        .select({ n: count() })
        .from(results)
        .where(and(eq(results.quizId, quizId), isNull(results.archivedAt)));
      if (n >= MAX_RESPONSES) {
        throw new ContentError("limit", `A quiz can have at most ${MAX_RESPONSES} responses.`);
      }
      const [{ last }] = await tx
        .select({ last: max(results.position) })
        .from(results)
        .where(eq(results.quizId, quizId));
      const [row] = await tx
        .insert(results)
        .values({ quizId, title: input.title, position: (last ?? -1) + 1 })
        .returning({ id: results.id });
      id = row.id;
    } else {
      const updated = await tx
        .update(results)
        .set({ title: input.title })
        .where(and(eq(results.id, input.id), eq(results.quizId, quizId), isNull(results.archivedAt)))
        .returning({ id: results.id });
      if (updated.length === 0) throw new ContentError("not_found", "That response no longer exists.");
      id = input.id;
    }
    await replaceWeights(tx, quizId, id, input.weights);
    await bumpStructureVersion(tx, quizId);
    return id;
  });
}

/** Everything about one response, from its editor page. */
export async function updateResponseDetails(
  db: Database,
  quizId: number,
  id: number,
  input: ResponseDetailsInput,
): Promise<void> {
  await db.transaction(async (tx) => {
    await lockQuiz(tx, quizId);
    const updated = await tx
      .update(results)
      .set({
        title: input.title,
        excerpt: input.excerpt,
        bodyHtml: sanitizeRichText(input.bodyHtml) ?? "",
        ctaUrl: input.ctaUrl,
        ctaLabel: input.ctaLabel,
      })
      .where(and(eq(results.id, id), eq(results.quizId, quizId), isNull(results.archivedAt)))
      .returning({ id: results.id });
    if (updated.length === 0) throw new ContentError("not_found", "That response no longer exists.");
    await replaceWeights(tx, quizId, id, input.weights);
    await bumpStructureVersion(tx, quizId);
  });
}

/** Archives the response if any submission matched it (keeping history), otherwise deletes it. */
export async function deleteResponse(db: Database, quizId: number, id: number): Promise<void> {
  await db.transaction(async (tx) => {
    await lockQuiz(tx, quizId);
    const [row] = await tx
      .select({ id: results.id })
      .from(results)
      .where(and(eq(results.id, id), eq(results.quizId, quizId), isNull(results.archivedAt)));
    if (!row) throw new ContentError("not_found", "That response no longer exists.");
    const [{ n }] = await tx.select({ n: count() }).from(submissions).where(eq(submissions.resultId, id));
    if (n > 0) {
      await tx.update(results).set({ archivedAt: new Date() }).where(eq(results.id, id));
    } else {
      await tx.delete(results).where(eq(results.id, id));
    }
    await bumpStructureVersion(tx, quizId);
  });
}

/** `orderedIds` must be exactly the quiz's current (non-archived) responses. */
export async function reorderResponses(db: Database, quizId: number, orderedIds: number[]): Promise<void> {
  await db.transaction(async (tx) => {
    await lockQuiz(tx, quizId);
    const existing = await tx
      .select({ id: results.id })
      .from(results)
      .where(and(eq(results.quizId, quizId), isNull(results.archivedAt)));
    const existingIds = new Set(existing.map((r) => r.id));
    const unique = new Set(orderedIds);
    if (
      unique.size !== orderedIds.length ||
      unique.size !== existingIds.size ||
      orderedIds.some((id) => !existingIds.has(id))
    ) {
      throw new ContentError("invalid", "The responses changed while you were reordering. Reload and try again.");
    }
    if (orderedIds.length > 0) {
      const cases = sql.join(
        orderedIds.map((id, index) => sql`when ${id}::int then ${index}::int`),
        sql` `,
      );
      await tx
        .update(results)
        .set({ position: sql`case ${results.id} ${cases} end` })
        .where(and(eq(results.quizId, quizId), inArray(results.id, orderedIds)));
    }
    await bumpStructureVersion(tx, quizId);
  });
}
