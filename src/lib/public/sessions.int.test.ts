import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createCategory } from "@/lib/content/categories";
import { saveQuestion } from "@/lib/content/questions";
import { createQuiz, setQuizStatus } from "@/lib/content/quizzes";
import { saveResponseRow, updateResponseDetails } from "@/lib/content/responses";
import { questionInput, responseDetailsInput } from "@/lib/content/validation";
import type { Database } from "@/lib/db/create";
import { quizSessions, results, submissionAnswers, submissions } from "@/lib/db/schema";
import { resetTestDb, setupTestDb, teardownTestDb, TEST_DATABASE_URL } from "@/test/db";
import { PublicError } from "./errors";
import { getResultByShareToken, getSessionView, listAttempts, restart, saveAnswers, submit } from "./sessions";
import { getPublishedQuiz, listPublishedQuizzes, type PublicQuiz } from "./structure";

async function expectPublicError(promise: Promise<unknown>, status: number, code: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(PublicError);
  expect((error as PublicError).status).toBe(status);
  expect((error as PublicError).code).toBe(code);
  return error as PublicError;
}

describe.skipIf(!TEST_DATABASE_URL)("public: structure and sessions (Postgres)", () => {
  let db: Database;
  let quizId: number;
  let quiz: PublicQuiz;
  let q1: number, q2: number, q3: number;
  let a: Record<string, number>;
  let forester: number, analyst: number;

  beforeAll(async () => {
    db = await setupTestDb();
  });
  afterAll(teardownTestDb);

  beforeEach(async () => {
    await resetTestDb();
    quizId = await createQuiz(db, { title: "Green Jobs", slug: "green-jobs" }, "a@example.org");
    const outd = await createCategory(db, quizId, { name: "Outdoors", abbr: "OUTD", color: "#3f7d4e", importance: 1 });
    const anly = await createCategory(db, quizId, { name: "Analytical", abbr: "ANLY", color: "#2f6690", importance: 1 });
    const make = async (title: string, required: boolean, type: "single" | "multi", answers: [string, Record<number, number>][]) =>
      saveQuestion(
        db,
        quizId,
        questionInput.parse({
          id: null,
          title,
          helpHtml: "<p>Help <script>x</script></p>",
          type,
          required,
          splitMulti: false,
          minSelect: 1,
          maxSelect: type === "multi" ? 2 : 1,
          answers: answers.map(([label, weights], i) => ({ key: `k${i}`, id: null, label, bodyHtml: null, weights })),
        }),
      );
    const r1 = await make("Weekend?", true, "single", [["Hike", { [outd]: 3 }], ["Spreadsheet", { [anly]: 3 }]]);
    const r2 = await make("Tools?", true, "multi", [["Saw", { [outd]: 2 }], ["Laptop", { [anly]: 2 }], ["Map", { [outd]: 1, [anly]: 1 }]]);
    const r3 = await make("Optional?", false, "single", [["Yes", { [outd]: 1 }], ["No", { [anly]: 1 }]]);
    [q1, q2, q3] = [r1.questionId, r2.questionId, r3.questionId];
    a = { hike: r1.answerIds.k0, sheet: r1.answerIds.k1, saw: r2.answerIds.k0, laptop: r2.answerIds.k1, map: r2.answerIds.k2, yes: r3.answerIds.k0 };
    forester = await saveResponseRow(db, quizId, { id: null, title: "Forester", weights: { [outd]: 5 } });
    analyst = await saveResponseRow(db, quizId, { id: null, title: "Analyst", weights: { [anly]: 5 } });
    await updateResponseDetails(
      db,
      quizId,
      forester,
      responseDetailsInput.parse({ title: "Forester", excerpt: "Trees!", bodyHtml: "<p><strong>Forests</strong></p>", ctaUrl: "https://example.org", ctaLabel: "More", weights: { [outd]: 5 } }),
    );
    await setQuizStatus(db, quizId, "published");
    quiz = (await getPublishedQuiz(db, { id: quizId }))!;
  });

  it("serves only published quizzes, without any weights", async () => {
    expect(await listPublishedQuizzes(db)).toEqual([{ id: quizId, slug: "green-jobs", title: "Green Jobs" }]);
    expect((await getPublishedQuiz(db, { slug: "green-jobs" }))?.id).toBe(quizId);
    const json = JSON.stringify(quiz);
    expect(json).not.toMatch(/weight/i);
    expect(json).not.toMatch(/categor/i);
    expect(quiz.questions[0].helpHtml).toBe("<p>Help </p>");
    expect(quiz.questions.map((q) => q.answers.length)).toEqual([2, 3, 2]);

    await setQuizStatus(db, quizId, "draft");
    expect(await getPublishedQuiz(db, { id: quizId })).toBeNull();
    expect(await listPublishedQuizzes(db)).toEqual([]);
  });

  it("creates nothing on read, and the session on the first write", async () => {
    expect((await getSessionView(db, quiz, null)).status).toBe("none");
    expect(await db.select().from(quizSessions)).toHaveLength(0);

    // A new respondent's client holds revision 0 (from the "none" view): not stale.
    const first = await saveAnswers(db, quiz, { tokenHash: null, entries: [{ questionId: q1, answerIds: [a.hike] }], clientRevision: 0 });
    expect(first.newToken).toMatch(/^[a-f0-9]{64}$/);
    expect(first.stale).toBe(false);
    expect(first.view).toMatchObject({ status: "in_progress", attemptNo: 1, answeredCount: 1, total: 3 });
    const [row] = await db.select().from(quizSessions);
    expect(row.tokenHash).not.toBe(first.newToken); // only the hash is stored

    const second = await saveAnswers(db, quiz, {
      tokenHash: first.tokenHash,
      entries: [{ questionId: q2, answerIds: [a.saw, a.map] }],
      clientRevision: first.revision,
      currentIndex: 1,
    });
    expect(second.newToken).toBeNull();
    expect(second.revision).toBe(first.revision + 1);
    expect(second.stale).toBe(false);
    expect(second.view.answers).toEqual({ [q1]: [a.hike], [q2]: [a.saw, a.map] });
    expect(second.view.currentIndex).toBe(1);
  });

  it("applies stale writes but flags them, and clears with an empty list", async () => {
    const first = await saveAnswers(db, quiz, { tokenHash: null, entries: [{ questionId: q1, answerIds: [a.hike] }] });
    await saveAnswers(db, quiz, { tokenHash: first.tokenHash, entries: [{ questionId: q2, answerIds: [a.saw] }] });
    const stale = await saveAnswers(db, quiz, {
      tokenHash: first.tokenHash,
      entries: [{ questionId: q1, answerIds: [a.sheet] }],
      clientRevision: first.revision,
    });
    expect(stale.stale).toBe(true);
    expect(stale.view.answers).toEqual({ [q1]: [a.sheet], [q2]: [a.saw] });

    const cleared = await saveAnswers(db, quiz, { tokenHash: first.tokenHash, entries: [{ questionId: q2, answerIds: [] }] });
    expect(cleared.view.answers).toEqual({ [q1]: [a.sheet] });
  });

  it("rejects answers that don't fit the published quiz", async () => {
    await expectPublicError(saveAnswers(db, quiz, { tokenHash: null, entries: [{ questionId: 999999, answerIds: [] }] }), 422, "quiz_invalid_answer");
    await expectPublicError(saveAnswers(db, quiz, { tokenHash: null, entries: [{ questionId: q1, answerIds: [a.saw] }] }), 422, "quiz_invalid_answer");
    await expectPublicError(saveAnswers(db, quiz, { tokenHash: null, entries: [{ questionId: q1, answerIds: [a.hike, a.sheet] }] }), 422, "quiz_invalid_answer");
    await expectPublicError(
      saveAnswers(db, quiz, { tokenHash: null, entries: [{ questionId: q2, answerIds: [a.saw, a.laptop, a.map] }] }),
      422,
      "quiz_invalid_answer",
    );
    expect(await db.select().from(quizSessions)).toHaveLength(0);
  });

  it("restarts into a new attempt, idempotently, never wiping history", async () => {
    const s = await saveAnswers(db, quiz, { tokenHash: null, entries: [{ questionId: q1, answerIds: [a.hike] }] });
    const r1 = await restart(db, quiz, s.tokenHash);
    expect(r1).toMatchObject({ status: "in_progress", attemptNo: 2, answeredCount: 0 });
    const r2 = await restart(db, quiz, s.tokenHash); // double click
    expect(r2.attemptNo).toBe(2);
    const rows = await db.select().from(quizSessions).orderBy(quizSessions.attemptNo);
    expect(rows.map((r) => [r.attemptNo, r.status])).toEqual([
      [1, "abandoned"],
      [2, "in_progress"],
    ]);
    expect(rows[0].answers).toEqual({ [q1]: [a.hike] });
    expect((await restart(db, quiz, null)).status).toBe("none");
  });

  it("submits with snapshots, idempotently, and serves the result by share token", async () => {
    const s = await saveAnswers(db, quiz, { tokenHash: null, entries: [{ questionId: q1, answerIds: [a.hike] }] });
    const missing = await expectPublicError(submit(db, quiz, { tokenHash: s.tokenHash }), 422, "quiz_missing_answers");
    expect(missing.details).toEqual({ questionIds: [q2] });

    await saveAnswers(db, quiz, { tokenHash: s.tokenHash, entries: [{ questionId: q2, answerIds: [a.saw] }] });
    const done = await submit(db, quiz, { tokenHash: s.tokenHash, email: "kid@example.org", referrer: "https://school.example/x" });
    expect(done.shareToken).toMatch(/^[a-f0-9]{32}$/);
    expect(done.alreadySubmitted).toBe(false);

    const again = await submit(db, quiz, { tokenHash: s.tokenHash });
    expect(again).toMatchObject({ shareToken: done.shareToken, submissionId: done.submissionId, alreadySubmitted: true });
    expect(await db.select().from(submissions)).toHaveLength(1);

    const [sub] = await db.select().from(submissions);
    expect(sub).toMatchObject({ resultId: forester, resultTitle: "Forester", email: "kid@example.org", questionsAnswered: 2, engineVersion: "1" });
    expect(sub.rawSimilarity).toBeCloseTo(1, 5);
    expect(sub.shareTokenHash).not.toBe(done.shareToken);
    expect(sub.suspect).toBe(true); // submitted within 3 seconds of starting
    const snapshot = sub.answers as { questionTitle: string; answers: { label: string; weights: Record<string, number> }[] }[];
    expect(snapshot.map((x) => [x.questionTitle, x.answers.map((y) => y.label)])).toEqual([
      ["Weekend?", ["Hike"]],
      ["Tools?", ["Saw"]],
    ]);
    expect(Object.values(snapshot[0].answers[0].weights)).toEqual([3]);
    const saRows = await db.select().from(submissionAnswers).orderBy(submissionAnswers.position);
    expect(saRows.map((r) => [r.questionTitle, r.answerTitle, r.position])).toEqual([
      ["Weekend?", "Hike", 0],
      ["Tools?", "Saw", 1],
    ]);

    const view = await getSessionView(db, quiz, s.tokenHash);
    expect(view.status).toBe("completed");
    expect(view.result).toMatchObject({ shareToken: done.shareToken, resultTitle: "Forester", percent: 100 });
    await expectPublicError(saveAnswers(db, quiz, { tokenHash: s.tokenHash, entries: [{ questionId: q3, answerIds: [a.yes] }] }), 409, "quiz_already_submitted");

    const payload = await getResultByShareToken(db, done.shareToken);
    expect(payload).toMatchObject({
      quiz: { id: quizId, slug: "green-jobs" },
      status: "scored",
      match: { resultId: forester, title: "Forester", bodyHtml: "<p><strong>Forests</strong></p>", ctaUrl: "https://example.org", percent: 100 },
      runnersUp: [{ resultId: analyst, title: "Analyst", percent: 0 }],
    });
    expect(Object.values(payload!.scores).map((x) => x.label)).toEqual(["Outdoors", "Analytical"]);
    const [outdoors, analytical] = Object.values(payload!.scores);
    expect(outdoors.percent).toBeGreaterThan(0);
    expect(outdoors.percent).toBeLessThanOrEqual(100);
    expect(analytical.percent).toBeGreaterThanOrEqual(0);
    expect(await getResultByShareToken(db, "f".repeat(32))).toBeNull();

    // History survives the response being deleted.
    await db.delete(results).where(eq(results.id, forester));
    const after = await getResultByShareToken(db, done.shareToken);
    expect(after?.match).toMatchObject({ title: "Forester", bodyHtml: null, percent: 100 });

    // Attempts, then a second attempt after restart.
    expect(await listAttempts(db, quizId, s.tokenHash)).toMatchObject([{ attemptNo: 1, resultTitle: "Forester", shareToken: done.shareToken }]);
    const r = await restart(db, quiz, s.tokenHash);
    expect(r.attemptNo).toBe(2);
  });

  it("refuses retakes when the quiz doesn't allow them", async () => {
    const s = await saveAnswers(db, quiz, { tokenHash: null, entries: [{ questionId: q1, answerIds: [a.hike] }, { questionId: q2, answerIds: [a.saw] }] });
    await submit(db, quiz, { tokenHash: s.tokenHash });
    await expectPublicError(restart(db, { ...quiz, settings: { ...quiz.settings, retakeAllowed: false } }, s.tokenHash), 403, "quiz_retake_not_allowed");
  });

  it("can't submit without a session", async () => {
    await expectPublicError(submit(db, quiz, { tokenHash: null }), 404, "quiz_session_not_found");
    await expectPublicError(submit(db, quiz, { tokenHash: "a".repeat(64) }), 404, "quiz_session_not_found");
  });
});
