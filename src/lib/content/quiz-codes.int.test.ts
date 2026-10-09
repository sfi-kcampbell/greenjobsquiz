import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { listSubmissions, parseListQuery } from "@/lib/admin/submissions";
import type { Database } from "@/lib/db/create";
import { quizCodes, submissions } from "@/lib/db/schema";
import { exportBatches, LONG_HEADER, longRows } from "@/lib/export/submissions-export";
import { restart, saveAnswers, submit } from "@/lib/public/sessions";
import { getPublishedQuiz, type PublicQuiz } from "@/lib/public/structure";
import { hashToken, newToken } from "@/lib/public/tokens";
import { resetTestDb, setupTestDb, teardownTestDb, TEST_DATABASE_URL } from "@/test/db";
import { createCategory } from "./categories";
import { codeInput } from "./quiz-code-rules";
import { codeReport, createCode, listCodes, resetReportLink, resolveCode, setCodeArchived, setRequireCode } from "./quiz-codes";
import { saveQuestion } from "./questions";
import { createQuiz, setQuizStatus } from "./quizzes";
import { saveResponseRow } from "./responses";
import { questionInput } from "./validation";

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const input = (code: string, opensOn = "", closesOn = "", label = "") => codeInput.parse({ code, label, opensOn, closesOn });

describe.skipIf(!TEST_DATABASE_URL)("quiz codes (Postgres)", () => {
  let db: Database;
  let quizId: number;
  let quiz: PublicQuiz;
  let qId: number;
  let a: { hike: number; code: number };

  beforeAll(async () => {
    db = await setupTestDb();
  });
  afterAll(teardownTestDb);

  beforeEach(async () => {
    await resetTestDb();
    quizId = await createQuiz(db, { title: "Green Jobs", slug: "green-jobs" }, "a@example.org");
    const outd = await createCategory(db, quizId, { name: "Outdoors", abbr: "OUTD", color: "#3f7d4e", importance: 1 });
    const anly = await createCategory(db, quizId, { name: "Analytical", abbr: "ANLY", color: "#2f6690", importance: 1 });
    const saved = await saveQuestion(
      db,
      quizId,
      questionInput.parse({
        id: null,
        title: "Weekend?",
        helpHtml: null,
        type: "single",
        required: true,
        splitMulti: false,
        minSelect: 1,
        maxSelect: 1,
        answers: [
          { key: "h", id: null, label: "Hike", bodyHtml: null, weights: { [outd]: 3 } },
          { key: "c", id: null, label: "Code", bodyHtml: null, weights: { [anly]: 3 } },
        ],
      }),
    );
    qId = saved.questionId;
    a = { hike: saved.answerIds.h, code: saved.answerIds.c };
    await saveResponseRow(db, quizId, { id: null, title: "Forester", weights: { [outd]: 5 } });
    await saveResponseRow(db, quizId, { id: null, title: "Analyst", weights: { [anly]: 5 } });
    await setQuizStatus(db, quizId, "published");
    quiz = (await getPublishedQuiz(db, { id: quizId }))!;
  });

  /** One respondent, start to finish. */
  async function take(answerId: number, code?: string | null) {
    const first = await saveAnswers(db, quiz, { tokenHash: null, entries: [{ questionId: qId, answerIds: [answerId] }], code });
    return submit(db, quiz, { tokenHash: first.tokenHash });
  }

  it("creates codes (unique, case-insensitive) and resolves them by status", async () => {
    await createCode(db, quizId, input("mail25"), "a@example.org");
    await expect(createCode(db, quizId, input("MAIL25"), "a@example.org")).rejects.toThrow(/already used/);
    await createCode(db, quizId, input("LATER1", day(2)), "a@example.org");
    await createCode(db, quizId, input("OLD123", day(-10), day(-2)), "a@example.org");
    const gone = await createCode(db, quizId, input("GONE99"), "a@example.org");
    await setCodeArchived(db, quizId, gone, true);

    expect(await resolveCode(db, quizId, "mail-25")).toMatchObject({ ok: true, code: "MAIL25" });
    expect(await resolveCode(db, quizId, "later1")).toMatchObject({ ok: false, reason: "not_open_yet" });
    expect(await resolveCode(db, quizId, "OLD123")).toMatchObject({ ok: false, reason: "closed" });
    expect(await resolveCode(db, quizId, "GONE99")).toMatchObject({ ok: false, reason: "closed" });
    expect(await resolveCode(db, quizId, "NOPE99")).toMatchObject({ ok: false, reason: "not_found" });
    expect(await resolveCode(db, quizId + 1, "MAIL25")).toMatchObject({ ok: false, reason: "not_found" }); // another quiz
    expect((await listCodes(db, quizId)).map((c) => c.status)).toEqual(["open", "scheduled", "closed", "archived"]);
  });

  it("records the code on attempts and submissions; counts, filter and CSV follow", async () => {
    const mail = await createCode(db, quizId, input("MAIL25"), "a@example.org");
    await take(a.hike, "mail25");
    await take(a.code); // no code
    await saveAnswers(db, quiz, { tokenHash: null, entries: [{ questionId: qId, answerIds: [a.hike] }], code: "MAIL25" }); // started only
    await expect(take(a.hike, "LATER1")).rejects.toMatchObject({ code: "quiz_code_invalid" });

    const [row] = await listCodes(db, quizId);
    expect([row.started, row.finished]).toEqual([2, 1]);

    const filtered = await listSubmissions(db, parseListQuery({ quiz: String(quizId), code: String(mail) }));
    expect(filtered.rows.map((r) => r.code)).toEqual(["MAIL25"]);
    // A code from another quiz is ignored, like a foreign response.
    expect((await listSubmissions(db, parseListQuery({ code: String(mail) }))).total).toBe(2);

    const batches = [];
    for await (const b of exportBatches(db, parseListQuery({ quiz: String(quizId), sort: "date", dir: "asc" }))) batches.push(...b);
    const codeCol = LONG_HEADER.indexOf("Quiz code");
    expect(batches.flatMap((s) => longRows(s, new Map())).map((r) => r[codeCol])).toEqual(["MAIL25", null]);

    // Deleting a code keeps the submissions.
    await db.delete(quizCodes).where(eq(quizCodes.id, mail));
    expect(await db.$count(submissions)).toBe(2);
  });

  it("a required code blocks new attempts, not ones already under way", async () => {
    await createCode(db, quizId, input("CLASS3"), "a@example.org");
    const early = await saveAnswers(db, quiz, { tokenHash: null, entries: [{ questionId: qId, answerIds: [a.hike] }] });
    await setRequireCode(db, quizId, true);
    quiz = (await getPublishedQuiz(db, { id: quizId }))!;
    expect(quiz.settings.requireCode).toBe(true);

    await expect(saveAnswers(db, quiz, { tokenHash: null, entries: [{ questionId: qId, answerIds: [a.hike] }] })).rejects.toMatchObject({
      status: 403,
      code: "quiz_code_required",
    });
    // Already started: carries on and finishes.
    await saveAnswers(db, quiz, { tokenHash: early.tokenHash, entries: [{ questionId: qId, answerIds: [a.code] }] });
    await submit(db, quiz, { tokenHash: early.tokenHash });
    // With a code: fine; a retake keeps the code it started with.
    const withCode = await saveAnswers(db, quiz, { tokenHash: null, entries: [{ questionId: qId, answerIds: [a.hike] }], code: "class3" });
    await submit(db, quiz, { tokenHash: withCode.tokenHash });
    const again = await restart(db, quiz, withCode.tokenHash);
    expect(again.attemptNo).toBe(2);
    // The early respondent had no code, so a retake needs one.
    await expect(restart(db, quiz, early.tokenHash)).rejects.toMatchObject({ code: "quiz_code_required" });
  });

  it("the teacher report holds back under 5, then shows shares and an average profile", async () => {
    const id = await createCode(db, quizId, input("MSLEE3", "", "", "Ms Lee, period 3"), "a@example.org");
    const token = (await listCodes(db, quizId))[0].reportToken;
    for (const pick of [a.hike, a.hike, a.code, a.hike]) await take(pick, "MSLEE3");
    let report = (await codeReport(db, token))!;
    expect([report.started, report.finished, report.summary, report.code.label]).toEqual([4, 4, null, "Ms Lee, period 3"]);

    await take(a.code, "MSLEE3");
    report = (await codeReport(db, token))!;
    expect(report.summary!.responses).toEqual([
      { title: "Forester", count: 3, percent: 60 },
      { title: "Analyst", count: 2, percent: 40 },
    ]);
    expect(report.summary!.profile).toEqual([
      { label: "Outdoors", color: "#3f7d4e", percent: 60 },
      { label: "Analytical", color: "#2f6690", percent: 40 },
    ]);

    expect(await codeReport(db, "0".repeat(32))).toBeNull();
    expect(await codeReport(db, "not-a-token")).toBeNull();
    await resetReportLink(db, quizId, id);
    expect(await codeReport(db, token)).toBeNull(); // old link revoked
    expect(await codeReport(db, (await listCodes(db, quizId))[0].reportToken)).not.toBeNull();
    expect(hashToken(newToken())).toHaveLength(64);
  });
});
