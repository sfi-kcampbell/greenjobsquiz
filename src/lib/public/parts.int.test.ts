import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createCategory } from "@/lib/content/categories";
import { listQuestions, saveQuestion } from "@/lib/content/questions";
import { exportQuiz, importQuiz } from "@/lib/content/quiz-file";
import { createQuiz, setQuizStatus } from "@/lib/content/quizzes";
import { saveResponseRow } from "@/lib/content/responses";
import { questionInput, type QuestionPart } from "@/lib/content/validation";
import { draftChanges, publishVersion, restoreToDraft } from "@/lib/content/versions";
import type { Database } from "@/lib/db/create";
import { submissionAnswers, submissions } from "@/lib/db/schema";
import { exportBatches, LONG_HEADER, longRows, wideCategories, wideExtras, wideHeader, wideRow } from "@/lib/export/submissions-export";
import { parseListQuery } from "@/lib/admin/submissions";
import { resetTestDb, setupTestDb, teardownTestDb, TEST_DATABASE_URL } from "@/test/db";
import { PublicError } from "./errors";
import { getSessionView, saveAnswers, saveFollowUp, submit } from "./sessions";
import { getPublishedQuiz, type PublicQuiz } from "./structure";

async function expectPublicError(promise: Promise<unknown>, status: number, code: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(PublicError);
  expect((error as PublicError).status).toBe(status);
  expect((error as PublicError).code).toBe(code);
}

describe.skipIf(!TEST_DATABASE_URL)("public: before-the-quiz and follow-up questions (Postgres)", () => {
  let db: Database;
  let quizId: number;
  let quiz: PublicQuiz;
  let outd: number, anly: number;
  let scored: number, grade: number, follow: number;
  let a: Record<string, number>;

  beforeAll(async () => {
    db = await setupTestDb();
  });
  afterAll(teardownTestDb);

  const make = (title: string, part: QuestionPart, answers: [string, Record<number, number>][], required = true) =>
    saveQuestion(
      db,
      quizId,
      questionInput.parse({
        id: null,
        title,
        helpHtml: null,
        type: "single",
        required,
        splitMulti: false,
        minSelect: 1,
        maxSelect: 1,
        part,
        answers: answers.map(([label, weights], i) => ({ key: `k${i}`, id: null, label, bodyHtml: null, weights })),
      }),
    );

  beforeEach(async () => {
    await resetTestDb();
    quizId = await createQuiz(db, { title: "Green Jobs", slug: "green-jobs" }, "a@example.org");
    outd = await createCategory(db, quizId, { name: "Outdoors", abbr: "OUTD", color: "#3f7d4e", importance: 1 });
    anly = await createCategory(db, quizId, { name: "Analytical", abbr: "ANLY", color: "#2f6690", importance: 1 });
    // Saved in a mixed order: the public flow puts "before" questions first.
    const s = await make("Weekend?", "scored", [["Hike", { [outd]: 3 }], ["Spreadsheet", { [anly]: 3 }]]);
    const f = await make("Was this useful?", "post", [["Yes", { [outd]: 5 }], ["No", {}]]);
    const g = await make("Grade?", "pre", [["9th", { [anly]: 4 }], ["10th", {}]]);
    [scored, follow, grade] = [s.questionId, f.questionId, g.questionId];
    a = { hike: s.answerIds.k0, sheet: s.answerIds.k1, yes: f.answerIds.k0, no: f.answerIds.k1, ninth: g.answerIds.k0, tenth: g.answerIds.k1 };
    await saveResponseRow(db, quizId, { id: null, title: "Forester", weights: { [outd]: 5 } });
    await saveResponseRow(db, quizId, { id: null, title: "Analyst", weights: { [anly]: 5 } });
    await setQuizStatus(db, quizId, "published");
    quiz = (await getPublishedQuiz(db, { id: quizId }))!;
  });

  async function finish(picks: [number, number][]) {
    const first = await saveAnswers(db, quiz, { tokenHash: null, entries: picks.map(([questionId, id]) => ({ questionId, answerIds: [id] })) });
    const done = await submit(db, quiz, { tokenHash: first.tokenHash });
    return { tokenHash: first.tokenHash, ...done };
  }

  it("drops weights from questions that aren't scored", async () => {
    const qs = await listQuestions(db, quizId);
    const byId = new Map(qs.map((q) => [q.id, q]));
    expect(byId.get(grade)!.part).toBe("pre");
    expect(byId.get(grade)!.answers.every((x) => Object.keys(x.weights).length === 0)).toBe(true);
    expect(byId.get(follow)!.answers.every((x) => Object.keys(x.weights).length === 0)).toBe(true);
    expect(byId.get(scored)!.answers[0].weights).toEqual({ [outd]: 3 });
  });

  it("asks 'before' questions first and keeps follow-ups apart", () => {
    expect(quiz.questions.map((q) => [q.id, q.part])).toEqual([
      [grade, "pre"],
      [scored, "scored"],
    ]);
    expect(quiz.followUp.map((q) => [q.id, q.part])).toEqual([[follow, "post"]]);
    expect(JSON.stringify(quiz)).not.toContain("weights");
  });

  it("requires 'before' answers, scores only scored ones, and snapshots the rest", async () => {
    const partial = await saveAnswers(db, quiz, { tokenHash: null, entries: [{ questionId: scored, answerIds: [a.sheet] }] });
    await expectPublicError(submit(db, quiz, { tokenHash: partial.tokenHash }), 422, "quiz_missing_answers");
    // Follow-ups can't be answered mid-quiz.
    await expect(saveAnswers(db, quiz, { tokenHash: partial.tokenHash, entries: [{ questionId: follow, answerIds: [a.yes] }] })).rejects.toThrow();

    const { submissionId } = await finish([
      [grade, a.ninth],
      [scored, a.hike],
    ]);
    const [s] = await db.select().from(submissions).where(eq(submissions.id, submissionId));
    expect(s.resultTitle).toBe("Forester");
    expect((s.answers as { questionId: number }[]).map((q) => q.questionId)).toEqual([scored]);
    expect(s.extraAnswers).toEqual([{ questionId: grade, questionTitle: "Grade?", part: "pre", answers: [{ answerId: a.ninth, label: "9th" }] }]);
    expect(s.questionsAnswered).toBe(2);
    const rows = await db.select().from(submissionAnswers).where(eq(submissionAnswers.submissionId, submissionId));
    expect(rows.map((r) => r.questionId).sort()).toEqual([scored, grade].sort());
  });

  it("saves follow-ups after submitting, replaces them on resend, and shows them in the session", async () => {
    const before = await saveAnswers(db, quiz, { tokenHash: null, entries: [{ questionId: grade, answerIds: [a.tenth] }] });
    await expectPublicError(
      saveFollowUp(db, quiz, { tokenHash: before.tokenHash, entries: [{ questionId: follow, answerIds: [a.yes] }] }),
      409,
      "quiz_not_submitted",
    );
    await expectPublicError(saveFollowUp(db, quiz, { tokenHash: null, entries: [] }), 409, "quiz_not_submitted");

    const { tokenHash, submissionId } = await finish([
      [grade, a.ninth],
      [scored, a.sheet],
    ]);
    await expectPublicError(saveFollowUp(db, quiz, { tokenHash, entries: [] }), 422, "quiz_missing_answers");
    await expect(saveFollowUp(db, quiz, { tokenHash, entries: [{ questionId: scored, answerIds: [a.hike] }] })).rejects.toBeInstanceOf(PublicError);
    await expect(saveFollowUp(db, quiz, { tokenHash, entries: [{ questionId: follow, answerIds: [a.hike] }] })).rejects.toBeInstanceOf(PublicError);

    expect(await saveFollowUp(db, quiz, { tokenHash, entries: [{ questionId: follow, answerIds: [a.yes] }] })).toEqual({ [follow]: [a.yes] });
    expect(await saveFollowUp(db, quiz, { tokenHash, entries: [{ questionId: follow, answerIds: [a.no] }] })).toEqual({ [follow]: [a.no] });

    const [s] = await db.select().from(submissions).where(eq(submissions.id, submissionId));
    expect(s.resultTitle).toBe("Analyst"); // never re-scored
    expect((s.extraAnswers as { part: string; answers: { label: string }[] }[]).map((q) => [q.part, q.answers[0].label])).toEqual([
      ["pre", "9th"],
      ["post", "No"],
    ]);
    const rows = await db.select().from(submissionAnswers).where(eq(submissionAnswers.submissionId, submissionId));
    expect(rows.filter((r) => r.questionId === follow).map((r) => r.answerTitle)).toEqual(["No"]);

    const view = await getSessionView(db, quiz, tokenHash);
    expect(view.result?.followUp).toEqual({ [follow]: [a.no] });
  });

  it("exports Part in the long CSV and a column per extra question in the wide one", async () => {
    const { tokenHash } = await finish([
      [grade, a.ninth],
      [scored, a.hike],
    ]);
    await saveFollowUp(db, quiz, { tokenHash, entries: [{ questionId: follow, answerIds: [a.yes] }] });
    const query = parseListQuery({ quiz: String(quizId) });
    const batch = [];
    for await (const b of exportBatches(db, query)) batch.push(...b);

    const long = batch.flatMap((s) => longRows(s, new Map()));
    const col = (name: string) => LONG_HEADER.indexOf(name);
    expect(long.map((r) => [r[col("Part")], r[col("Question #")], r[col("Question")], r[col("Answer(s)")]])).toEqual([
      ["Before", 1, "Grade?", "9th"],
      ["Scored", 1, "Weekend?", "Hike"],
      ["Follow-up", 1, "Was this useful?", "Yes"],
    ]);
    expect(long[2][col("Contribution")]).toBeNull();

    const cats = await wideCategories(db, query);
    const extras = await wideExtras(db, query);
    const header = wideHeader(cats, extras);
    expect(header.slice(-2)).toEqual(["Before: Grade?", "Follow-up: Was this useful?"]);
    const row = wideRow(batch[0], cats, extras);
    expect(row.length).toBe(header.length);
    expect(row.slice(-2)).toEqual(["9th", "Yes"]);
  });

  it("versions carry the part: a draft until published, older attempts keep their follow-ups, restore and export too", async () => {
    // An attempt starts on v1 (with the follow-up).
    const started = await saveAnswers(db, quiz, { tokenHash: null, entries: [{ questionId: grade, answerIds: [a.ninth] }] });

    // Turn the follow-up into a "before" question: only a draft so far.
    const qs = await listQuestions(db, quizId);
    const f = qs.find((q) => q.id === follow)!;
    await saveQuestion(
      db,
      quizId,
      questionInput.parse({
        id: follow,
        title: f.title,
        helpHtml: null,
        type: "single",
        required: true,
        splitMulti: false,
        minSelect: 1,
        maxSelect: 1,
        part: "pre",
        answers: f.answers.map((x, i) => ({ key: `k${i}`, id: x.id, label: x.label, bodyHtml: null, weights: {} })),
      }),
    );
    const draft = await draftChanges(db, quizId);
    expect(draft?.changes).toEqual(["Moved question 2 “Was this useful?” to Before the quiz"]);
    expect((await getPublishedQuiz(db, { id: quizId }))!.followUp.map((q) => q.id)).toEqual([follow]);

    await publishVersion(db, quizId, "a@example.org");
    const v2 = (await getPublishedQuiz(db, { id: quizId }))!;
    expect(v2.followUp).toEqual([]);
    expect(v2.questions.map((q) => q.id)).toContain(follow);

    // The v1 attempt finishes on v1, so its follow-up is still asked there.
    await saveAnswers(db, v2, { tokenHash: started.tokenHash, entries: [{ questionId: scored, answerIds: [a.hike] }] });
    await submit(db, v2, { tokenHash: started.tokenHash });
    expect(await saveFollowUp(db, v2, { tokenHash: started.tokenHash, entries: [{ questionId: follow, answerIds: [a.yes] }] })).toEqual({
      [follow]: [a.yes],
    });

    await restoreToDraft(db, quizId, 1);
    expect((await listQuestions(db, quizId)).find((q) => q.id === follow)?.part).toBe("post");

    const file = await exportQuiz(db, quizId);
    expect(file.questions.map((q) => q.part).sort()).toEqual(["post", "pre", "scored"]);
    const copy = await importQuiz(db, file, { createdBy: "a@example.org", copy: true });
    expect((await listQuestions(db, copy)).map((q) => q.part).sort()).toEqual(["post", "pre", "scored"]);
  });
});
