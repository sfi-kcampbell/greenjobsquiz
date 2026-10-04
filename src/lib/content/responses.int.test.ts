import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/create";
import { results, resultWeights, submissions } from "@/lib/db/schema";
import { resetTestDb, setupTestDb, teardownTestDb, TEST_DATABASE_URL } from "@/test/db";
import { createCategory } from "./categories";
import { ContentError } from "./errors";
import { createQuiz, getQuiz } from "./quizzes";
import {
  deleteResponse,
  getResponse,
  listResponses,
  reorderResponses,
  saveResponseRow,
  updateResponseDetails,
} from "./responses";
import { MAX_RESPONSES, responseDetailsInput } from "./validation";

async function expectContentError(promise: Promise<unknown>, code: ContentError["code"]) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ContentError);
  expect((error as ContentError).code).toBe(code);
}

describe.skipIf(!TEST_DATABASE_URL)("content: responses (Postgres)", () => {
  let db: Database;
  let quizId: number;
  let outdoors: number;
  let analytical: number;

  beforeAll(async () => {
    db = await setupTestDb();
  });
  afterAll(teardownTestDb);
  beforeEach(async () => {
    await resetTestDb();
    quizId = await createQuiz(db, { title: "Quiz", slug: "quiz" }, "a@example.org");
    outdoors = await createCategory(db, quizId, { name: "Outdoors", abbr: "OUTD", color: "#336699", importance: 1 });
    analytical = await createCategory(db, quizId, { name: "Analytical", abbr: "ANLY", color: "#336699", importance: 1 });
  });

  it("creates a row with sparse weights, then updates its details", async () => {
    const v0 = (await getQuiz(db, quizId))!.structureVersion;
    const id = await saveResponseRow(db, quizId, { id: null, title: "Forester", weights: { [outdoors]: 5, [analytical]: 0 } });
    expect(await db.select().from(resultWeights)).toHaveLength(1);

    await updateResponseDetails(
      db,
      quizId,
      id,
      responseDetailsInput.parse({
        title: "Forester",
        excerpt: "Manage forests.",
        bodyHtml: '<p onclick="x()"><strong>Big trees</strong></p><script>bad()</script>',
        ctaUrl: "https://example.org/forester",
        ctaLabel: "Learn more",
        weights: { [outdoors]: 4, [analytical]: -1 },
      }),
    );
    const view = await getResponse(db, quizId, id);
    expect(view).toMatchObject({
      title: "Forester",
      excerpt: "Manage forests.",
      bodyHtml: "<p><strong>Big trees</strong></p>",
      ctaUrl: "https://example.org/forester",
      ctaLabel: "Learn more",
      weights: { [outdoors]: 4, [analytical]: -1 },
    });
    expect((await getQuiz(db, quizId))!.structureVersion).toBe(v0 + 2);

    // Matrix save keeps the details, replaces the weights.
    await saveResponseRow(db, quizId, { id, title: "Forester II", weights: { [analytical]: 2 } });
    expect(await getResponse(db, quizId, id)).toMatchObject({ title: "Forester II", excerpt: "Manage forests.", weights: { [analytical]: 2 } });
  });

  it("rejects categories from another quiz and edits through another quiz", async () => {
    const other = await createQuiz(db, { title: "Other", slug: "other" }, "a@example.org");
    const foreign = await createCategory(db, other, { name: "X", abbr: "X", color: "#336699", importance: 1 });
    await expectContentError(saveResponseRow(db, quizId, { id: null, title: "R", weights: { [foreign]: 1 } }), "invalid");
    expect(await listResponses(db, quizId)).toEqual([]);

    const id = await saveResponseRow(db, quizId, { id: null, title: "Mine", weights: {} });
    await expectContentError(saveResponseRow(db, other, { id, title: "Stolen", weights: {} }), "not_found");
    await expectContentError(deleteResponse(db, other, id), "not_found");
    expect(await getResponse(db, other, id)).toBeNull();
  });

  it("archives a response a submission matched, and deletes one nobody matched", async () => {
    const matched = await saveResponseRow(db, quizId, { id: null, title: "Matched", weights: { [outdoors]: 1 } });
    const unused = await saveResponseRow(db, quizId, { id: null, title: "Unused", weights: {} });
    await db.insert(submissions).values({
      quizId,
      tokenHash: "a".repeat(64),
      attemptNo: 1,
      resultId: matched,
      resultTitle: "Matched",
      scores: {},
      ranked: [],
      answers: {},
      engineVersion: "1",
    });
    await deleteResponse(db, quizId, matched);
    await deleteResponse(db, quizId, unused);
    expect(await listResponses(db, quizId)).toEqual([]);
    const [kept] = await db.select().from(results).where(eq(results.id, matched));
    expect(kept.archivedAt).not.toBeNull();
    expect(await db.select().from(results).where(eq(results.id, unused))).toHaveLength(0);
  });

  it("reorders to 0..n and rejects incomplete lists", async () => {
    const ids = [];
    for (const title of ["A", "B", "C"]) ids.push(await saveResponseRow(db, quizId, { id: null, title, weights: {} }));
    await reorderResponses(db, quizId, [ids[2], ids[0], ids[1]]);
    expect((await listResponses(db, quizId)).map((r) => [r.title, r.position])).toEqual([["C", 0], ["A", 1], ["B", 2]]);
    await expectContentError(reorderResponses(db, quizId, [ids[0]]), "invalid");
  });

  it(`limits a quiz to ${MAX_RESPONSES} responses`, async () => {
    await db.insert(results).values(Array.from({ length: MAX_RESPONSES }, (_, i) => ({ quizId, title: `R${i}`, position: i })));
    await expectContentError(saveResponseRow(db, quizId, { id: null, title: "One more", weights: {} }), "limit");
  });
});
