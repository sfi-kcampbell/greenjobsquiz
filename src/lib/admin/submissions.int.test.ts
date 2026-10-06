import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createCategory } from "@/lib/content/categories";
import { saveQuestion } from "@/lib/content/questions";
import { createQuiz, setQuizStatus } from "@/lib/content/quizzes";
import { saveResponseRow } from "@/lib/content/responses";
import { questionInput } from "@/lib/content/validation";
import type { Database } from "@/lib/db/create";
import { quizSessions, submissionAnswers, submissions } from "@/lib/db/schema";
import { getResultByShareToken, getSessionView, saveAnswers, submit } from "@/lib/public/sessions";
import { getPublishedQuiz, type PublicQuiz } from "@/lib/public/structure";
import { score } from "@/lib/scoring/engine";
import { loadScoringBundle } from "@/lib/content/scoring-model";
import { resetTestDb, setupTestDb, teardownTestDb, TEST_DATABASE_URL } from "@/test/db";
import { deleteSubmissions, getSubmissionDetail, listSubmissions, parseListQuery, revokeShareLink, SORT_KEYS } from "./submissions";

describe.skipIf(!TEST_DATABASE_URL)("admin: submissions (Postgres)", () => {
  let db: Database;
  let quizA: PublicQuiz;
  let quizB: PublicQuiz;
  let forester: number, otherResponse: number;
  let hike: number, sheet: number;

  /** Makes a quiz with one required question (Hike → Outdoors, Spreadsheet → Analytical). */
  async function makeQuiz(slug: string) {
    const id = await createQuiz(db, { title: slug === "a" ? "Alpha quiz" : "Beta quiz", slug }, "a@example.org");
    const outd = await createCategory(db, id, { name: "Outdoors", abbr: "OUTD", color: "#3f7d4e", importance: 1 });
    const anly = await createCategory(db, id, { name: "Analytical", abbr: "ANLY", color: "#2f6690", importance: 1 });
    const q = await saveQuestion(
      db,
      id,
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
          { key: "h", id: null, label: "Hike", bodyHtml: "<p>Out <em>there</em></p>", weights: { [outd]: 3 } },
          { key: "s", id: null, label: "Spreadsheet", bodyHtml: null, weights: { [anly]: 3, [outd]: 1 } },
        ],
      }),
    );
    const f = await saveResponseRow(db, id, { id: null, title: "Forester", weights: { [outd]: 5 } });
    const an = await saveResponseRow(db, id, { id: null, title: "Analyst 100%_", weights: { [anly]: 5 } });
    await setQuizStatus(db, id, "published");
    return { quiz: (await getPublishedQuiz(db, { id }))!, q: q.questionId, hike: q.answerIds.h, sheet: q.answerIds.s, forester: f, analyst: an };
  }

  /** One respondent taking `quiz` and picking `answerId`; returns the submission and share token. */
  async function take(quiz: PublicQuiz, questionId: number, answerId: number, email?: string) {
    const saved = await saveAnswers(db, quiz, { tokenHash: null, entries: [{ questionId, answerIds: [answerId] }] });
    const done = await submit(db, quiz, { tokenHash: saved.tokenHash, email: email ?? null });
    return { ...done, tokenHash: saved.tokenHash };
  }

  let ids: Record<string, number>;
  let qA: number;
  let shareOfFirst: string;
  let tokenOfFirst: string;

  beforeAll(async () => {
    db = await setupTestDb();
  });
  afterAll(teardownTestDb);

  beforeEach(async () => {
    await resetTestDb();
    const a = await makeQuiz("a");
    const b = await makeQuiz("b");
    quizA = a.quiz;
    quizB = b.quiz;
    qA = a.q;
    [forester, otherResponse, hike, sheet] = [a.forester, b.forester, a.hike, a.sheet];
    const s1 = await take(quizA, a.q, a.hike, "kim@example.org");
    const s2 = await take(quizA, a.q, a.sheet);
    const s3 = await take(quizA, a.q, a.hike, "100%_off@example.org");
    const s4 = await take(quizB, b.q, b.sheet, "lee@example.org");
    ids = { s1: s1.submissionId, s2: s2.submissionId, s3: s3.submissionId, s4: s4.submissionId };
    shareOfFirst = s1.shareToken;
    tokenOfFirst = s1.tokenHash;
    // Spread them over days: s1 Jan 1, s2 Jan 2, s3 Jan 3, s4 Jan 4.
    for (const [i, id] of [ids.s1, ids.s2, ids.s3, ids.s4].entries()) {
      await db.update(submissions).set({ createdAt: new Date(Date.UTC(2026, 0, i + 1, 12)) }).where(eq(submissions.id, id));
    }
  });

  const list = (params: Record<string, string>) => listSubmissions(db, parseListQuery(params));
  const idsOf = (r: Awaited<ReturnType<typeof list>>) => r.rows.map((x) => x.id);

  it("lists newest first with every column", async () => {
    const r = await list({});
    expect(r.total).toBe(4);
    expect(idsOf(r)).toEqual([ids.s4, ids.s3, ids.s2, ids.s1]);
    const first = r.rows.find((x) => x.id === ids.s1)!;
    expect(first).toMatchObject({
      attemptNo: 1,
      quizTitle: "Alpha quiz",
      email: "kim@example.org",
      resultTitle: "Forester",
      topCategory: "Outdoors",
      questionsAnswered: 1,
      questionTotal: 1,
    });
    expect(first.percent).toBe(100);
    expect(r.rows.find((x) => x.id === ids.s2)!.email).toBeNull();
  });

  it("filters by quiz, response (only the quiz's own), dates and search", async () => {
    expect(idsOf(await list({ quiz: String(quizA.id) }))).toEqual([ids.s3, ids.s2, ids.s1]);
    expect(idsOf(await list({ quiz: String(quizA.id), response: String(forester) }))).toEqual([ids.s3, ids.s1]);
    // A response from another quiz is ignored, not "no results".
    expect((await list({ quiz: String(quizA.id), response: String(otherResponse) })).total).toBe(3);
    // Response without quiz is ignored.
    expect((await list({ response: String(forester) })).total).toBe(4);
    expect(idsOf(await list({ from: "2026-01-02", to: "2026-01-03" }))).toEqual([ids.s3, ids.s2]);
    expect(idsOf(await list({ q: "KIM" }))).toEqual([ids.s1]);
    expect(idsOf(await list({ q: "analyst" }))).toEqual([ids.s4, ids.s2]);
    expect(idsOf(await list({ q: "lee", quiz: String(quizA.id) }))).toEqual([]);
  });

  it("escapes LIKE wildcards in search", async () => {
    // "%" alone would match everything if it weren't escaped.
    expect(idsOf(await list({ q: "%" }))).toEqual([ids.s4, ids.s3, ids.s2]); // two "Analyst 100%_" titles + the 100%_ email
    expect(idsOf(await list({ q: "0%_o" }))).toEqual([ids.s3]);
    expect((await list({ q: "_" })).total).toBe(3);
  });

  it("sorts by every allowed key both ways, and ignores anything else", async () => {
    for (const sort of SORT_KEYS) {
      for (const dir of ["asc", "desc"]) {
        const r = await list({ sort, dir });
        expect(r.total).toBe(4);
        expect(new Set(idsOf(r)).size).toBe(4);
      }
    }
    expect(idsOf(await list({ sort: "date", dir: "asc" }))).toEqual([ids.s1, ids.s2, ids.s3, ids.s4]);
    const byRespondent = idsOf(await list({ sort: "respondent", dir: "asc" }));
    expect(byRespondent.at(-1)).toBe(ids.s2); // anonymous (null) last
    expect(idsOf(await list({ sort: "id; drop table quizzes", dir: "sideways" }))).toEqual([ids.s4, ids.s3, ids.s2, ids.s1]);
  });

  it("pages with stable totals", async () => {
    const question = quizB.questions[0];
    for (let i = 0; i < 30; i++) await take(quizB, question.id, question.answers[0].id);
    const p1 = await list({ per: "25" });
    const p2 = await list({ per: "25", page: "2" });
    expect([p1.total, p1.pages, p1.rows.length, p2.rows.length]).toEqual([34, 2, 25, 9]);
    expect(new Set([...idsOf(p1), ...idsOf(p2)]).size).toBe(34);
    expect((await list({ per: "25", page: "99" })).page).toBe(2); // clamped
    expect((await list({ per: "7" })).per).toBe(25); // not an allowed size
  });

  it("builds the detail: gaps, profile, and the stored transcript matching the engine", async () => {
    const d = (await getSubmissionDetail(db, ids.s2))!;
    expect(d.quiz.title).toBe("Alpha quiz");
    expect(d.match?.title).toBe("Analyst 100%_");
    expect(d.ranking[0].gapPoints).toBe(0);
    expect(d.ranking[1].gapPoints).toBe(d.ranking[0].percent - d.ranking[1].percent);
    expect(d.ranking[1].gapRaw).toBeCloseTo(d.ranking[0].raw - d.ranking[1].raw);
    expect(d.categories.map((c) => c.label)).toEqual(["Outdoors", "Analytical"]);
    expect(d.transcript).toHaveLength(1);
    expect(d.transcript[0].answers[0]).toMatchObject({ label: "Spreadsheet", stillExists: true });
    expect(d.transcript[0].answers[0].weights.map((w) => w.label).sort()).toEqual(["Analytical", "Outdoors"]);

    // Same as Simulate: the engine on the same weights gives the stored contribution.
    const bundle = await loadScoringBundle(db, quizA.id);
    const fresh = score(bundle.model, [{ questionId: qA, answerIds: [sheet] }]);
    const expected = fresh.contributions[0].vector;
    const stored = Object.fromEntries(d.transcript[0].contribution.map((c) => [c.label, c.value]));
    const labels = Object.fromEntries(bundle.display.categories.map((c) => [c.id, c.name]));
    for (const [cat, value] of Object.entries(expected)) if (value !== 0) expect(stored[labels[Number(cat)]]).toBeCloseTo(value);

    const withBody = (await getSubmissionDetail(db, ids.s1))!;
    expect(withBody.transcript[0].answers[0].currentBodyHtml).toBe("<p>Out <em>there</em></p>");
    expect(withBody.shareToken).toBe(shareOfFirst);
    expect(await getSubmissionDetail(db, 999999)).toBeNull();
  });

  it("revokes a share link", async () => {
    expect(await getResultByShareToken(db, shareOfFirst)).not.toBeNull();
    await revokeShareLink(db, ids.s1);
    expect(await getResultByShareToken(db, shareOfFirst)).toBeNull();
    const d = (await getSubmissionDetail(db, ids.s1))!;
    expect([d.shareToken, d.shareRevoked]).toEqual([null, true]);
  });

  it("deletes submissions and their answers, and frees the respondent to start again", async () => {
    expect(await deleteSubmissions(db, [ids.s1, ids.s2])).toBe(2);
    expect((await list({})).total).toBe(2);
    const left = await db.select({ n: sql<number>`count(*)::int` }).from(submissionAnswers);
    expect(left[0].n).toBe(2);
    const [session] = await db.select().from(quizSessions).where(eq(quizSessions.tokenHash, tokenOfFirst));
    expect([session.status, session.submissionId]).toEqual(["abandoned", null]);
    expect((await getSessionView(db, quizA, tokenOfFirst)).status).toBe("none");
    const again = await saveAnswers(db, quizA, { tokenHash: tokenOfFirst, entries: [{ questionId: qA, answerIds: [hike] }] });
    expect(again.view.attemptNo).toBe(2);
    expect(await deleteSubmissions(db, [])).toBe(0);
  });

  it("parses the URL defensively", () => {
    expect(parseListQuery({})).toEqual({ quiz: undefined, response: undefined, from: undefined, to: undefined, q: undefined, sort: "date", dir: "desc", page: 1, per: 25 });
    expect(parseListQuery({ quiz: ["3", "4"], from: "2026-13-45", to: "yesterday", page: "-2", per: "50", q: "  " })).toMatchObject({
      quiz: 3,
      from: undefined,
      to: undefined,
      page: 1,
      per: 50,
      q: undefined,
    });
  });
});
