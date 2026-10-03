/**
 * Category reads and writes: the template for every builder entity.
 *
 * Each write runs in one transaction that locks the parent quiz, checks the
 * row belongs to it, makes the change, and bumps the quiz's structure version.
 */
import { and, asc, count, eq, inArray, max, sql } from "drizzle-orm";
import type { Database, Executor } from "@/lib/db/create";
import { answerWeights, categories, resultWeights } from "@/lib/db/schema";
import { ContentError, pgError, PG_UNIQUE_VIOLATION } from "./errors";
import { bumpStructureVersion, lockQuiz } from "./quizzes";
import { MAX_CATEGORIES, SUGGESTED_CATEGORIES, type CategoryInput } from "./validation";

export type CategoryView = {
  id: number;
  name: string;
  abbr: string;
  color: string;
  importance: number;
  position: number;
  answerCount: number;
  resultCount: number;
};

export async function listCategories(db: Executor, quizId: number): Promise<CategoryView[]> {
  const answerUse = db
    .select({ categoryId: answerWeights.categoryId, n: count().as("answer_n") })
    .from(answerWeights)
    .groupBy(answerWeights.categoryId)
    .as("answer_use");
  const resultUse = db
    .select({ categoryId: resultWeights.categoryId, n: count().as("result_n") })
    .from(resultWeights)
    .groupBy(resultWeights.categoryId)
    .as("result_use");

  return db
    .select({
      id: categories.id,
      name: categories.name,
      abbr: categories.abbr,
      color: categories.color,
      importance: categories.importance,
      position: categories.position,
      answerCount: sql<number>`coalesce(${answerUse.n}, 0)::int`,
      resultCount: sql<number>`coalesce(${resultUse.n}, 0)::int`,
    })
    .from(categories)
    .leftJoin(answerUse, eq(answerUse.categoryId, categories.id))
    .leftJoin(resultUse, eq(resultUse.categoryId, categories.id))
    .where(eq(categories.quizId, quizId))
    .orderBy(asc(categories.position), asc(categories.id));
}

function duplicateName(error: unknown): never {
  const pg = pgError(error);
  if (pg?.code === PG_UNIQUE_VIOLATION) {
    if (pg.constraint === "categories_quiz_abbr_ci") {
      throw new ContentError("conflict", "Another category already uses that abbreviation.", "abbr");
    }
    throw new ContentError("conflict", "Another category already has that name.", "name");
  }
  throw error;
}

async function categoryCount(tx: Executor, quizId: number): Promise<number> {
  const [row] = await tx.select({ n: count() }).from(categories).where(eq(categories.quizId, quizId));
  return row.n;
}

export async function createCategory(db: Database, quizId: number, input: CategoryInput): Promise<number> {
  try {
    return await db.transaction(async (tx) => {
      await lockQuiz(tx, quizId);
      if ((await categoryCount(tx, quizId)) >= MAX_CATEGORIES) {
        throw new ContentError("limit", `A quiz can have at most ${MAX_CATEGORIES} categories.`);
      }
      const [{ last }] = await tx
        .select({ last: max(categories.position) })
        .from(categories)
        .where(eq(categories.quizId, quizId));
      const [row] = await tx
        .insert(categories)
        .values({ ...input, quizId, position: (last ?? -1) + 1 })
        .returning({ id: categories.id });
      await bumpStructureVersion(tx, quizId);
      return row.id;
    });
  } catch (error) {
    if (error instanceof ContentError) throw error;
    duplicateName(error);
  }
}

export async function updateCategory(
  db: Database,
  quizId: number,
  id: number,
  input: CategoryInput,
): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await lockQuiz(tx, quizId);
      const updated = await tx
        .update(categories)
        .set(input)
        .where(and(eq(categories.id, id), eq(categories.quizId, quizId)))
        .returning({ id: categories.id });
      if (updated.length === 0) throw new ContentError("not_found", "That category no longer exists.");
      await bumpStructureVersion(tx, quizId);
    });
  } catch (error) {
    if (error instanceof ContentError) throw error;
    duplicateName(error);
  }
}

/** Foreign keys cascade, so this also removes every answer and result weight for the category. */
export async function deleteCategory(db: Database, quizId: number, id: number): Promise<void> {
  await db.transaction(async (tx) => {
    await lockQuiz(tx, quizId);
    const deleted = await tx
      .delete(categories)
      .where(and(eq(categories.id, id), eq(categories.quizId, quizId)))
      .returning({ id: categories.id });
    if (deleted.length === 0) throw new ContentError("not_found", "That category no longer exists.");
    await bumpStructureVersion(tx, quizId);
  });
}

/**
 * `orderedIds` must be exactly the quiz's categories. Positions are rewritten
 * 0..n for the whole set, so gaps and duplicates can't build up.
 */
export async function reorderCategories(db: Database, quizId: number, orderedIds: number[]): Promise<void> {
  await db.transaction(async (tx) => {
    await lockQuiz(tx, quizId);
    const existing = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.quizId, quizId));
    const existingIds = new Set(existing.map((r) => r.id));
    const unique = new Set(orderedIds);
    if (
      unique.size !== orderedIds.length ||
      unique.size !== existingIds.size ||
      orderedIds.some((id) => !existingIds.has(id))
    ) {
      throw new ContentError("invalid", "The categories changed while you were reordering. Reload and try again.");
    }
    if (orderedIds.length > 0) {
      const cases = sql.join(
        orderedIds.map((id, index) => sql`when ${id}::int then ${index}::int`),
        sql` `,
      );
      await tx
        .update(categories)
        .set({ position: sql`case ${categories.id} ${cases} end` })
        .where(and(eq(categories.quizId, quizId), inArray(categories.id, orderedIds)));
    }
    await bumpStructureVersion(tx, quizId);
  });
}

/** Only for a quiz with no categories yet. */
export async function seedSuggestedCategories(db: Database, quizId: number): Promise<void> {
  await db.transaction(async (tx) => {
    await lockQuiz(tx, quizId);
    if ((await categoryCount(tx, quizId)) > 0) {
      throw new ContentError("conflict", "This quiz already has categories.");
    }
    await tx
      .insert(categories)
      .values(SUGGESTED_CATEGORIES.map((c, position) => ({ ...c, quizId, position })));
    await bumpStructureVersion(tx, quizId);
  });
}
