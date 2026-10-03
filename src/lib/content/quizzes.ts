/**
 * Quiz reads and writes. Every function takes the database (or a
 * transaction) so it can be used from server actions and integration tests.
 */
import { count, desc, eq, sql } from "drizzle-orm";
import type { Database, Executor } from "@/lib/db/create";
import { categories, quizzes } from "@/lib/db/schema";
import { ContentError, pgError, PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION } from "./errors";
import type { QuizInput } from "./validation";

export type QuizSummary = {
  id: number;
  title: string;
  slug: string;
  status: "draft" | "published";
  categoryCount: number;
  updatedAt: Date;
};

export async function listQuizzes(db: Executor): Promise<QuizSummary[]> {
  return db
    .select({
      id: quizzes.id,
      title: quizzes.title,
      slug: quizzes.slug,
      status: quizzes.status,
      categoryCount: count(categories.id),
      updatedAt: quizzes.updatedAt,
    })
    .from(quizzes)
    .leftJoin(categories, eq(categories.quizId, quizzes.id))
    .groupBy(quizzes.id)
    .orderBy(desc(quizzes.updatedAt));
}

export async function getQuiz(db: Executor, id: number) {
  const [quiz] = await db.select().from(quizzes).where(eq(quizzes.id, id)).limit(1);
  return quiz ?? null;
}

/**
 * Locks the quiz row for the rest of the transaction, so concurrent writers
 * to the same quiz (e.g. two people adding categories) run one at a time.
 */
export async function lockQuiz(tx: Executor, id: number): Promise<void> {
  const rows = await tx.select({ id: quizzes.id }).from(quizzes).where(eq(quizzes.id, id)).for("update");
  if (rows.length === 0) throw new ContentError("not_found", "That quiz no longer exists.");
}

/**
 * Call inside every transaction that changes what respondents see. The
 * public structure cache and ETag key off this number.
 */
export async function bumpStructureVersion(tx: Executor, quizId: number): Promise<void> {
  await tx
    .update(quizzes)
    .set({ structureVersion: sql`${quizzes.structureVersion} + 1`, updatedAt: new Date() })
    .where(eq(quizzes.id, quizId));
}

function slugConflict(error: unknown): never {
  if (pgError(error)?.code === PG_UNIQUE_VIOLATION) {
    throw new ContentError("conflict", "Another quiz already uses that URL slug.", "slug");
  }
  throw error;
}

export async function createQuiz(db: Database, input: QuizInput, createdBy: string): Promise<number> {
  try {
    const [row] = await db
      .insert(quizzes)
      .values({ title: input.title, slug: input.slug, createdBy })
      .returning({ id: quizzes.id });
    return row.id;
  } catch (error) {
    slugConflict(error);
  }
}

export async function updateQuiz(db: Database, id: number, input: QuizInput): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await lockQuiz(tx, id);
      await tx.update(quizzes).set({ title: input.title, slug: input.slug }).where(eq(quizzes.id, id));
      await bumpStructureVersion(tx, id);
    });
  } catch (error) {
    if (error instanceof ContentError) throw error;
    slugConflict(error);
  }
}

/** Fails if the quiz has submissions: unpublish it instead, so history survives. */
export async function deleteQuiz(db: Database, id: number): Promise<void> {
  try {
    const deleted = await db.delete(quizzes).where(eq(quizzes.id, id)).returning({ id: quizzes.id });
    if (deleted.length === 0) throw new ContentError("not_found", "That quiz no longer exists.");
  } catch (error) {
    if (pgError(error)?.code === PG_FOREIGN_KEY_VIOLATION) {
      throw new ContentError(
        "conflict",
        "This quiz has submissions, so it can't be deleted. Unpublish it instead.",
      );
    }
    throw error;
  }
}
