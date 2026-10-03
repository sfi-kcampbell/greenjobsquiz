import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/create";
import { answers, answerWeights, questions, submissionAnswers, submissions } from "@/lib/db/schema";
import { resetTestDb, setupTestDb, teardownTestDb, TEST_DATABASE_URL } from "@/test/db";
import { createCategory } from "./categories";
import { ContentError } from "./errors";
import { deleteQuestion, listQuestions, reorderQuestions, saveQuestion } from "./questions";
import { createQuiz, getQuiz } from "./quizzes";
import { MAX_ANSWERS, MAX_QUESTIONS, questionInput, type QuestionInput } from "./validation";

async function expectContentError(promise: Promise<unknown>, code: ContentError["code"]) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ContentError);
  expect((error as ContentError).code).toBe(code);
}

describe.skipIf(!TEST_DATABASE_URL)("content: questions (Postgres)", () => {
  let db: Database;
  let quizId: number;
  let outdoors: number;
  let analytical: number;

  const q = (overrides: Partial<Record<string, unknown>> = {}): QuestionInput =>
    questionInput.parse({
      id: null,
      title: "Rainy day?",
      helpHtml: null,
      type: "single",
      required: true,
      splitMulti: false,
      minSelect: 1,
      maxSelect: 1,
      answers: [
        { key: "a", id: null, label: "Love it", bodyHtml: "<p><strong>Yes</strong></p>", weights: { [outdoors]: 3, [analytical]: 0 } },
        { key: "b", id: null, label: "Stay in", bodyHtml: null, weights: { [analytical]: 2 } },
      ],
      ...overrides,
    });

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

  it("creates a question with answers and sparse weights", async () => {
    const v0 = (await getQuiz(db, quizId))!.structureVersion;
    const { questionId, answerIds } = await saveQuestion(db, quizId, q());
    expect(Object.keys(answerIds).sort()).toEqual(["a", "b"]);

    const [view] = await listQuestions(db, quizId);
    expect(view.id).toBe(questionId);
    expect(view.answers.map((a) => [a.label, a.position, a.weights])).toEqual([
      ["Love it", 0, { [outdoors]: 3 }],
      ["Stay in", 1, { [analytical]: 2 }],
    ]);
    expect(view.answers[0].bodyHtml).toBe("<p><strong>Yes</strong></p>");
    // The zero weight was not stored.
    expect(await db.select().from(answerWeights)).toHaveLength(2);
    expect((await getQuiz(db, quizId))!.structureVersion).toBe(v0 + 1);
  });

  it("updates: renames, reorders, removes and adds answers in one save", async () => {
    const { questionId, answerIds } = await saveQuestion(db, quizId, q());
    const result = await saveQuestion(
      db,
      quizId,
      q({
        id: questionId,
        title: "Rain?",
        answers: [
          { key: "b", id: answerIds.b, label: "Indoors", bodyHtml: null, weights: { [analytical]: -1 } },
          { key: "c", id: null, label: "Depends", bodyHtml: "<p></p>", weights: {} },
        ],
      }),
    );
    expect(result.answerIds.b).toBe(answerIds.b);

    const [view] = await listQuestions(db, quizId);
    expect(view.title).toBe("Rain?");
    expect(view.answers.map((a) => [a.label, a.position, a.weights, a.bodyHtml])).toEqual([
      ["Indoors", 0, { [analytical]: -1 }, null],
      ["Depends", 1, {}, null],
    ]);
    expect(await db.select().from(answers).where(eq(answers.id, answerIds.a))).toHaveLength(0);
  });

  it("sanitizes rich text on save", async () => {
    await saveQuestion(
      db,
      quizId,
      q({ helpHtml: '<p onclick="x()">Help<script>bad()</script></p>' }),
    );
    expect((await listQuestions(db, quizId))[0].helpHtml).toBe("<p>Help</p>");
  });

  it("rejects categories from another quiz and answers from another question", async () => {
    const other = await createQuiz(db, { title: "Other", slug: "other" }, "a@example.org");
    const foreign = await createCategory(db, other, { name: "X", abbr: "X", color: "#336699", importance: 1 });
    await expectContentError(
      saveQuestion(db, quizId, q({ answers: [{ key: "a", id: null, label: "A", bodyHtml: null, weights: { [foreign]: 1 } }] })),
      "invalid",
    );

    const first = await saveQuestion(db, quizId, q());
    const second = await saveQuestion(db, quizId, q({ title: "Second" }));
    await expectContentError(
      saveQuestion(db, quizId, q({ id: second.questionId, answers: [{ key: "a", id: first.answerIds.a, label: "Stolen", bodyHtml: null, weights: {} }] })),
      "invalid",
    );
    // Nothing from the failed saves was written.
    expect((await listQuestions(db, quizId)).find((x) => x.id === first.questionId)!.answers[0].label).toBe("Love it");
  });

  it("won't edit a question through another quiz", async () => {
    const { questionId } = await saveQuestion(db, quizId, q());
    const other = await createQuiz(db, { title: "Other", slug: "other" }, "a@example.org");
    await expectContentError(saveQuestion(db, other, q({ id: questionId, answers: [] })), "not_found");
    await expectContentError(deleteQuestion(db, other, questionId), "not_found");
  });

  it("archives answers and questions that submissions refer to", async () => {
    const { questionId, answerIds } = await saveQuestion(db, quizId, q());
    const [sub] = await db
      .insert(submissions)
      .values({ quizId, tokenHash: "a".repeat(64), attemptNo: 1, scores: {}, ranked: [], answers: {}, engineVersion: "1" })
      .returning();
    await db.insert(submissionAnswers).values({
      submissionId: sub.id,
      quizId,
      questionId,
      answerId: answerIds.a,
      questionTitle: "Rainy day?",
      answerTitle: "Love it",
      position: 0,
    });

    // Removing a referenced answer archives it.
    await saveQuestion(db, quizId, q({ id: questionId, answers: [{ key: "b", id: answerIds.b, label: "Stay in", bodyHtml: null, weights: {} }] }));
    const [archived] = await db.select().from(answers).where(eq(answers.id, answerIds.a));
    expect(archived.archivedAt).not.toBeNull();
    expect((await listQuestions(db, quizId))[0].answers.map((a) => a.label)).toEqual(["Stay in"]);

    // Deleting a referenced question archives it and its answers.
    await deleteQuestion(db, quizId, questionId);
    expect(await listQuestions(db, quizId)).toEqual([]);
    const live = await db.select().from(answers).where(and(eq(answers.questionId, questionId), isNull(answers.archivedAt)));
    expect(live).toHaveLength(0);
    expect(await db.select().from(questions).where(eq(questions.id, questionId))).toHaveLength(1);
  });

  it("deletes an unreferenced question outright", async () => {
    const { questionId } = await saveQuestion(db, quizId, q());
    await deleteQuestion(db, quizId, questionId);
    expect(await db.select().from(questions)).toHaveLength(0);
    expect(await db.select().from(answers)).toHaveLength(0);
  });

  it("reorders questions to 0..n and rejects bad lists", async () => {
    const ids = [];
    for (const title of ["One", "Two", "Three"]) ids.push((await saveQuestion(db, quizId, q({ title }))).questionId);
    await reorderQuestions(db, quizId, [ids[1], ids[2], ids[0]]);
    const list = await listQuestions(db, quizId);
    expect(list.map((x) => [x.title, x.position])).toEqual([["Two", 0], ["Three", 1], ["One", 2]]);
    await expectContentError(reorderQuestions(db, quizId, [ids[0], ids[1]]), "invalid");
  });

  it(`limits a quiz to ${MAX_QUESTIONS} questions; validation limits answers to ${MAX_ANSWERS}`, async () => {
    const rows = Array.from({ length: MAX_QUESTIONS }, (_, i) => ({ quizId, title: `Q${i}`, position: i }));
    await db.insert(questions).values(rows);
    await expectContentError(saveQuestion(db, quizId, q()), "limit");
  });
});
