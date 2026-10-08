/**
 * Quiz reads and writes. Every function takes the database (or a
 * transaction) so it can be used from server actions and integration tests.
 */
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import type { Database, Executor } from "@/lib/db/create";
import { categories, media, quizzes, results } from "@/lib/db/schema";
import { sanitizeRichText } from "@/lib/sanitize/rich-text";
import { ContentError, pgError, PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION } from "./errors";
import type { QuizBannerInput, QuizDeliveryInput, QuizInput, QuizRespondentInput, QuizScoringInput } from "./validation";

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
      await tx
        .update(quizzes)
        .set({
          title: input.title,
          slug: input.slug,
          ...(input.introHtml !== undefined ? { introHtml: sanitizeRichText(input.introHtml) ?? "" } : {}),
        })
        .where(eq(quizzes.id, id));
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

/** Scoring settings: runners-up shown, per-category balancing, fallback response. */
export async function updateQuizScoring(db: Database, id: number, input: QuizScoringInput): Promise<void> {
  await db.transaction(async (tx) => {
    await lockQuiz(tx, id);
    if (input.defaultResultId !== null) {
      const [owned] = await tx
        .select({ id: results.id })
        .from(results)
        .where(and(eq(results.id, input.defaultResultId), eq(results.quizId, id), isNull(results.archivedAt)));
      if (!owned) {
        throw new ContentError("invalid", "Choose a fallback response from this quiz.", "defaultResultId");
      }
    }
    await tx
      .update(quizzes)
      .set({
        runnersUpCount: input.runnersUpCount,
        normalizePerCategory: input.normalizePerCategory,
        defaultResultId: input.defaultResultId,
      })
      .where(eq(quizzes.id, id));
    await bumpStructureVersion(tx, id);
  });
}

/** How respondents move through the quiz: progress bar, auto-advance, retakes. */
export async function updateQuizRespondentOptions(db: Database, id: number, input: QuizRespondentInput): Promise<void> {
  await db.transaction(async (tx) => {
    await lockQuiz(tx, id);
    await tx.update(quizzes).set(input).where(eq(quizzes.id, id));
    await bumpStructureVersion(tx, id);
  });
}

/** Question layout, page template, and hosted vs headless delivery. */
export async function updateQuizDelivery(db: Database, id: number, input: QuizDeliveryInput): Promise<void> {
  await db.transaction(async (tx) => {
    await lockQuiz(tx, id);
    await tx.update(quizzes).set(input).where(eq(quizzes.id, id));
    await bumpStructureVersion(tx, id);
  });
}

/** Sets, replaces or (mediaId null) removes the banner image. */
export async function updateQuizBanner(db: Database, id: number, input: QuizBannerInput): Promise<void> {
  await db.transaction(async (tx) => {
    await lockQuiz(tx, id);
    if (input.mediaId) {
      const [found] = await tx.select({ id: media.id }).from(media).where(eq(media.id, input.mediaId)).limit(1);
      if (!found) throw new ContentError("invalid", "That image wasn't found. Upload it again.", "mediaId");
    }
    await tx
      .update(quizzes)
      .set({ bannerMediaId: input.mediaId, bannerAlt: input.mediaId ? input.alt : null })
      .where(eq(quizzes.id, id));
    await bumpStructureVersion(tx, id);
  });
}

/** The quiz's own CSS (validated by customCssInput). */
export async function updateQuizCss(db: Database, id: number, css: string): Promise<void> {
  await db.transaction(async (tx) => {
    await lockQuiz(tx, id);
    await tx.update(quizzes).set({ customCss: css }).where(eq(quizzes.id, id));
    await bumpStructureVersion(tx, id);
  });
}

/** Publish or unpublish. Unpublishing never touches submissions. */
export async function setQuizStatus(db: Database, id: number, status: "draft" | "published"): Promise<void> {
  await db.transaction(async (tx) => {
    await lockQuiz(tx, id);
    await tx
      .update(quizzes)
      .set({
        status,
        // Remember the first publish; keep it through later unpublish/publish cycles.
        ...(status === "published" ? { publishedAt: sql`coalesce(${quizzes.publishedAt}, now())` } : {}),
      })
      .where(eq(quizzes.id, id));
    await bumpStructureVersion(tx, id);
  });
}
