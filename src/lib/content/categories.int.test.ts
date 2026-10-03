import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/create";
import {
  answerWeights,
  answers,
  categories,
  questions,
  quizzes,
  results,
  resultWeights,
  submissions,
} from "@/lib/db/schema";
import { resetTestDb, setupTestDb, teardownTestDb, TEST_DATABASE_URL } from "@/test/db";
import {
  createCategory,
  deleteCategory,
  listCategories,
  reorderCategories,
  seedSuggestedCategories,
  updateCategory,
} from "./categories";
import { ContentError } from "./errors";
import { createQuiz, deleteQuiz, getQuiz, listQuizzes, updateQuiz } from "./quizzes";
import { MAX_CATEGORIES, SUGGESTED_CATEGORIES } from "./validation";

const cat = (name: string, abbr: string) => ({ name, abbr, color: "#336699", importance: 1 });

async function version(db: Database, quizId: number) {
  return (await getQuiz(db, quizId))!.structureVersion;
}

async function expectContentError(promise: Promise<unknown>, code: ContentError["code"], field?: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ContentError);
  expect((error as ContentError).code).toBe(code);
  if (field) expect((error as ContentError).field).toBe(field);
}

describe.skipIf(!TEST_DATABASE_URL)("content: quizzes and categories (Postgres)", () => {
  let db: Database;
  let quizId: number;

  beforeAll(async () => {
    db = await setupTestDb();
  });
  afterAll(teardownTestDb);
  beforeEach(async () => {
    await resetTestDb();
    quizId = await createQuiz(db, { title: "Green Jobs", slug: "green-jobs" }, "a@example.org");
  });

  describe("quizzes", () => {
    it("creates, lists, updates and rejects duplicate slugs", async () => {
      await expectContentError(createQuiz(db, { title: "Other", slug: "green-jobs" }, "a@example.org"), "conflict", "slug");
      const other = await createQuiz(db, { title: "Other", slug: "other" }, "a@example.org");
      await expectContentError(updateQuiz(db, other, { title: "Other", slug: "green-jobs" }), "conflict", "slug");

      const before = await version(db, quizId);
      await updateQuiz(db, quizId, { title: "Green Careers", slug: "green-careers" });
      expect((await getQuiz(db, quizId))!.slug).toBe("green-careers");
      expect(await version(db, quizId)).toBe(before + 1);

      await createCategory(db, quizId, cat("Outdoors", "OUTD"));
      const list = await listQuizzes(db);
      expect(list.find((q) => q.id === quizId)?.categoryCount).toBe(1);
      expect(list.find((q) => q.id === other)?.categoryCount).toBe(0);
    });

    it("deletes a quiz without submissions, but not one with submissions", async () => {
      const spare = await createQuiz(db, { title: "Spare", slug: "spare" }, "a@example.org");
      await createCategory(db, spare, cat("Outdoors", "OUTD"));
      await deleteQuiz(db, spare);
      expect(await getQuiz(db, spare)).toBeNull();
      await expectContentError(deleteQuiz(db, spare), "not_found");

      await db.insert(submissions).values({
        quizId,
        tokenHash: "a".repeat(64),
        attemptNo: 1,
        scores: {},
        ranked: [],
        answers: {},
        engineVersion: "1",
      });
      await expectContentError(deleteQuiz(db, quizId), "conflict");
      expect(await getQuiz(db, quizId)).not.toBeNull();
    });
  });

  describe("categories", () => {
    it("creates in order, updates, and bumps the structure version on every write", async () => {
      const v0 = await version(db, quizId);
      const a = await createCategory(db, quizId, cat("Outdoors", "OUTD"));
      const b = await createCategory(db, quizId, cat("Analytical", "ANLY"));
      await updateCategory(db, quizId, b, { ...cat("Analysis", "ANAL"), importance: 2.5 });

      const list = await listCategories(db, quizId);
      expect(list.map((c) => [c.id, c.name, c.position])).toEqual([
        [a, "Outdoors", 0],
        [b, "Analysis", 1],
      ]);
      expect(list[1].importance).toBe(2.5);
      expect(await version(db, quizId)).toBe(v0 + 3);
    });

    it("rejects duplicate names and abbreviations, case-insensitively", async () => {
      const a = await createCategory(db, quizId, cat("Outdoors", "OUTD"));
      await expectContentError(createCategory(db, quizId, cat("outdoors", "XX")), "conflict", "name");
      await expectContentError(createCategory(db, quizId, cat("Other", "outd")), "conflict", "abbr");
      const b = await createCategory(db, quizId, cat("Creative", "CREA"));
      await expectContentError(updateCategory(db, quizId, b, cat("OUTDOORS", "CREA")), "conflict", "name");
      // Same names are fine in a different quiz.
      const other = await createQuiz(db, { title: "Other", slug: "other" }, "a@example.org");
      await createCategory(db, other, cat("Outdoors", "OUTD"));
      // Saving a row unchanged is fine.
      await updateCategory(db, quizId, a, cat("Outdoors", "OUTD"));
    });

    it("won't touch a category through another quiz", async () => {
      const a = await createCategory(db, quizId, cat("Outdoors", "OUTD"));
      const other = await createQuiz(db, { title: "Other", slug: "other" }, "a@example.org");
      await expectContentError(updateCategory(db, other, a, cat("Hacked", "HACK")), "not_found");
      await expectContentError(deleteCategory(db, other, a), "not_found");
      await expectContentError(reorderCategories(db, other, [a]), "invalid");
      expect((await listCategories(db, quizId))[0].name).toBe("Outdoors");
    });

    it(`caps a quiz at ${MAX_CATEGORIES} categories`, async () => {
      for (let i = 0; i < MAX_CATEGORIES; i++) {
        await createCategory(db, quizId, cat(`Category ${i}`, `C${i}`));
      }
      await expectContentError(createCategory(db, quizId, cat("One more", "MORE")), "limit");
    });

    it("reorders the whole set to 0..n and rejects incomplete or foreign lists", async () => {
      const ids = [];
      for (const [name, abbr] of [["A", "A"], ["B", "B"], ["C", "C"]]) {
        ids.push(await createCategory(db, quizId, cat(name, abbr)));
      }
      await reorderCategories(db, quizId, [ids[2], ids[0], ids[1]]);
      const list = await listCategories(db, quizId);
      expect(list.map((c) => c.name)).toEqual(["C", "A", "B"]);
      expect(list.map((c) => c.position)).toEqual([0, 1, 2]);

      await expectContentError(reorderCategories(db, quizId, [ids[0], ids[1]]), "invalid");
      await expectContentError(reorderCategories(db, quizId, [ids[0], ids[0], ids[1]]), "invalid");
      await expectContentError(reorderCategories(db, quizId, [ids[0], ids[1], 999999]), "invalid");
    });

    it("seeds the suggested set only into an empty quiz", async () => {
      await seedSuggestedCategories(db, quizId);
      const list = await listCategories(db, quizId);
      expect(list.map((c) => c.name)).toEqual(SUGGESTED_CATEGORIES.map((c) => c.name));
      await expectContentError(seedSuggestedCategories(db, quizId), "conflict");
    });

    it("deleting a category removes its answer and result weights, and nothing else", async () => {
      const outdoors = await createCategory(db, quizId, cat("Outdoors", "OUTD"));
      const analytical = await createCategory(db, quizId, cat("Analytical", "ANLY"));
      const [q] = await db.insert(questions).values({ quizId, title: "Q1" }).returning();
      const [ans] = await db.insert(answers).values({ questionId: q.id, label: "Outside" }).returning();
      const [res] = await db.insert(results).values({ quizId, title: "Forester" }).returning();
      await db.insert(answerWeights).values([
        { answerId: ans.id, categoryId: outdoors, weight: 3 },
        { answerId: ans.id, categoryId: analytical, weight: -1 },
      ]);
      await db.insert(resultWeights).values([
        { resultId: res.id, categoryId: outdoors, weight: 5 },
        { resultId: res.id, categoryId: analytical, weight: 1 },
      ]);

      const before = await listCategories(db, quizId);
      expect(before.find((c) => c.id === outdoors)).toMatchObject({ answerCount: 1, resultCount: 1 });

      await deleteCategory(db, quizId, outdoors);

      const weightsFor = async (categoryId: number) => ({
        answers: (await db.select({ n: count() }).from(answerWeights).where(eq(answerWeights.categoryId, categoryId)))[0].n,
        results: (await db.select({ n: count() }).from(resultWeights).where(eq(resultWeights.categoryId, categoryId)))[0].n,
      });
      expect(await weightsFor(outdoors)).toEqual({ answers: 0, results: 0 });
      expect(await weightsFor(analytical)).toEqual({ answers: 1, results: 1 });
      expect((await db.select().from(categories)).map((c) => c.id)).toEqual([analytical]);
      expect(await db.select().from(quizzes)).toHaveLength(1);
    });
  });
});
