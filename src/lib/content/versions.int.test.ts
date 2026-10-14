import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/create";
import { quizVersions, results, submissions } from "@/lib/db/schema";
import { getResultByShareToken, restart, saveAnswers, submit } from "@/lib/public/sessions";
import { getPublishedQuiz } from "@/lib/public/structure";
import { resetTestDb, setupTestDb, teardownTestDb, TEST_DATABASE_URL } from "@/test/db";
import { createCategory, deleteCategory } from "./categories";
import { deleteQuestion, listQuestions, saveQuestion } from "./questions";
import { createQuiz, setQuizStatus, updateQuiz, updateQuizBanner } from "./quizzes";
import { deleteResponse, listResponses, saveResponseRow, updateResponseDetails } from "./responses";
import { loadScoringBundle } from "./scoring-model";
import { questionInput } from "./validation";
import { diffContent, draftChanges, latestVersion, listVersions, publishVersion, readWorkingContent, restoreToDraft } from "./versions";

describe.skipIf(!TEST_DATABASE_URL)("drafts and versions (Postgres)", () => {
  let db: Database;
  let quizId: number;
  let outd: number, anly: number;
  let q1: number, q2: number;
  let a: Record<string, number>;
  let forester: number, analyst: number;

  beforeAll(async () => {
    db = await setupTestDb();
  });
  afterAll(teardownTestDb);

  const question = (id: number | null, title: string, answers: { key: string; id?: number; label: string; weights: Record<number, number> }[]) =>
    questionInput.parse({
      id,
      title,
      helpHtml: null,
      type: "single",
      required: true,
      splitMulti: false,
      minSelect: 1,
      maxSelect: 1,
      answers: answers.map((x) => ({ key: x.key, id: x.id ?? null, label: x.label, bodyHtml: null, weights: x.weights })),
    });

  beforeEach(async () => {
    await resetTestDb();
    quizId = await createQuiz(db, { title: "Green Jobs", slug: "green-jobs" }, "a@example.org");
    outd = await createCategory(db, quizId, { name: "Outdoors", abbr: "OUTD", color: "#3f7d4e", importance: 1 });
    anly = await createCategory(db, quizId, { name: "Analytical", abbr: "ANLY", color: "#2f6690", importance: 1 });
    const r1 = await saveQuestion(db, quizId, question(null, "Weekend?", [{ key: "h", label: "Hike", weights: { [outd]: 3 } }, { key: "c", label: "Code", weights: { [anly]: 3 } }]));
    const r2 = await saveQuestion(db, quizId, question(null, "Tools?", [{ key: "s", label: "Saw", weights: { [outd]: 2 } }, { key: "l", label: "Laptop", weights: { [anly]: 2 } }]));
    [q1, q2] = [r1.questionId, r2.questionId];
    a = { hike: r1.answerIds.h, code: r1.answerIds.c, saw: r2.answerIds.s, laptop: r2.answerIds.l };
    forester = await saveResponseRow(db, quizId, { id: null, title: "Forester", weights: { [outd]: 5 } });
    analyst = await saveResponseRow(db, quizId, { id: null, title: "Analyst", weights: { [anly]: 5 } });
  });

  const publish = async (note?: string) => {
    const r = await publishVersion(db, quizId, "a@example.org", note);
    await setQuizStatus(db, quizId, "published");
    return r;
  };
  const live = async () => (await getPublishedQuiz(db, { id: quizId }))!;

  it("serves the published version, not the draft; publishes only real changes", async () => {
    expect(await getPublishedQuiz(db, { id: quizId })).toBeNull(); // draft
    const v1 = await publish("First");
    expect([v1.created, v1.version.number]).toEqual([true, 1]);
    expect((await live()).questions.map((q) => q.title)).toEqual(["Weekend?", "Tools?"]);

    await updateQuiz(db, quizId, { title: "Green Jobs 2", slug: "green-jobs", introHtml: "<p>New</p>" });
    await saveQuestion(db, quizId, question(q1, "Your weekend?", [{ key: "h", id: a.hike, label: "Hike", weights: { [outd]: 3 } }, { key: "c", id: a.code, label: "Code", weights: { [anly]: 4 } }]));
    let pub = await live();
    expect([pub.title, pub.questions[0].title, pub.version]).toEqual(["Green Jobs", "Weekend?", 1]);
    const draft = await draftChanges(db, quizId);
    expect(draft!.changes).toEqual(['Changed the title to “Green Jobs 2”', "Changed the introduction", 'Edited question 1 “Your weekend?”', "Changed weights on 1 answer"]);

    // Live settings apply straight away, without a new version.
    await setQuizStatus(db, quizId, "published");
    expect((await live()).version).toBe(1);

    const v2 = await publish();
    expect([v2.created, v2.version.number]).toEqual([true, 2]);
    pub = await live();
    expect([pub.title, pub.questions[0].title, pub.version]).toEqual(["Green Jobs 2", "Your weekend?", 2]);
    expect((await publish()).created).toBe(false); // nothing changed
    expect((await getPublishedQuiz(db, { id: quizId }, { version: 1 }))!.questions[0].title).toBe("Weekend?");

    await setQuizStatus(db, quizId, "draft");
    expect(await getPublishedQuiz(db, { id: quizId })).toBeNull();
    await setQuizStatus(db, quizId, "published");
    expect((await live()).version).toBe(2);
    expect((await listVersions(db, quizId)).map((v) => [v.number, v.note])).toEqual([[2, null], [1, "First"]]);
  });

  it("an attempt finishes on the version it started on", async () => {
    await publish();
    const v1 = await live();
    const started = await saveAnswers(db, v1, { tokenHash: null, entries: [{ questionId: q1, answerIds: [a.code] }] });

    // v2: Tools? removed; Code now points outdoors; Analyst deleted from the draft.
    await deleteQuestion(db, quizId, q2);
    await saveQuestion(db, quizId, question(q1, "Weekend?", [{ key: "h", id: a.hike, label: "Hike", weights: { [outd]: 3 } }, { key: "c", id: a.code, label: "Code", weights: { [outd]: 5 } }]));
    await deleteResponse(db, quizId, analyst);
    await publish();
    const v2 = await live();
    expect(v2.questions.map((q) => q.id)).toEqual([q1]);

    // The v1 attempt can still answer v1's question 2, and must (it's required there).
    await saveAnswers(db, v2, { tokenHash: started.tokenHash, entries: [{ questionId: q2, answerIds: [a.laptop] }] });
    const done = await submit(db, v2, { tokenHash: started.tokenHash });
    const [sub] = await db.select().from(submissions).where(eq(submissions.id, done.submissionId));
    expect(sub.resultTitle).toBe("Analyst"); // scored with v1's weights
    expect(sub.resultId).toBeNull(); // Analyst no longer exists as a row
    const [v1row] = await db.select().from(quizVersions).where(eq(quizVersions.number, 1));
    expect(sub.versionId).toBe(v1row.id);

    // A new attempt is on v2, where q2 doesn't exist.
    const fresh = await saveAnswers(db, v2, { tokenHash: null, entries: [{ questionId: q1, answerIds: [a.code] }] });
    expect(fresh.view.version).toBe(2);
    await expect(saveAnswers(db, v2, { tokenHash: fresh.tokenHash, entries: [{ questionId: q2, answerIds: [a.laptop] }] })).rejects.toMatchObject({ code: "quiz_invalid_answer" });
    const again = await restart(db, v2, started.tokenHash);
    expect(again.version).toBe(2);
  });

  it("shared results show the latest published wording, never the draft", async () => {
    await updateResponseDetails(db, quizId, forester, { title: "Forester", excerpt: "v1 words", bodyHtml: "<p>v1</p>", ctaUrl: null, ctaLabel: null, weights: { [outd]: 5 } });
    await publish();
    const s = await saveAnswers(db, await live(), { tokenHash: null, entries: [{ questionId: q1, answerIds: [a.hike] }, { questionId: q2, answerIds: [a.saw] }] });
    const { shareToken } = await submit(db, await live(), { tokenHash: s.tokenHash });
    expect((await getResultByShareToken(db, shareToken))!.match!.excerpt).toBe("v1 words");

    await updateResponseDetails(db, quizId, forester, { title: "Forester", excerpt: "draft words", bodyHtml: "<p>draft</p>", ctaUrl: null, ctaLabel: null, weights: { [outd]: 5 } });
    expect((await getResultByShareToken(db, shareToken))!.match!.excerpt).toBe("v1 words");
    await publish();
    expect((await getResultByShareToken(db, shareToken))!.match!.excerpt).toBe("draft words");
  });

  it("restores a version into the draft, recreating and archiving rows as needed", async () => {
    await publish();
    const v1 = await readWorkingContent(db, quizId);
    // Take the quiz once so Laptop is used by a submission.
    const s = await saveAnswers(db, await live(), { tokenHash: null, entries: [{ questionId: q1, answerIds: [a.hike] }, { questionId: q2, answerIds: [a.laptop] }] });
    await submit(db, await live(), { tokenHash: s.tokenHash });

    await deleteQuestion(db, quizId, q2); // archived (Laptop has a submission)
    await deleteCategory(db, quizId, anly); // weights gone
    await deleteResponse(db, quizId, analyst); // deleted? no: matched nobody → deleted
    const extra = await saveQuestion(db, quizId, question(null, "Extra?", [{ key: "x", label: "X", weights: { [outd]: 1 } }]));
    await updateQuiz(db, quizId, { title: "Changed", slug: "green-jobs" });

    await restoreToDraft(db, quizId, 1);
    const restored = await readWorkingContent(db, quizId);
    expect(diffContent(v1, restored)).toEqual([]);
    expect((await listQuestions(db, quizId)).map((q) => q.id)).toEqual([q1, q2]);
    expect((await listResponses(db, quizId)).map((r) => r.id)).toEqual([forester, analyst]); // same ids back
    expect((await listQuestions(db, quizId)).some((q) => q.id === extra.questionId)).toBe(false);
    expect(await db.$count(submissions)).toBe(1);
    expect((await draftChanges(db, quizId))!.changes).toEqual([]);
    // The scoring bundle (Simulate/Health) follows the restored draft.
    expect((await loadScoringBundle(db, quizId)).model.categories.map((c) => c.id)).toEqual([outd, anly]);
  });

  it("creates version 1 for a quiz published before versions existed", async () => {
    await setQuizStatus(db, quizId, "published"); // no publishVersion
    expect(await db.$count(quizVersions)).toBe(0);
    const pub = await live();
    expect(pub.version).toBe(1);
    expect((await latestVersion(db, quizId))!.note).toMatch(/automatically/);
    await Promise.all([latestVersion(db, quizId), latestVersion(db, quizId)]);
    expect(await db.$count(quizVersions)).toBe(1);
  });

  it("live settings stay live", async () => {
    await publish();
    await updateQuizBanner(db, quizId, { mediaId: null, alt: "" });
    await db.update(results).set({ title: "Renamed in draft" }).where(eq(results.id, forester));
    expect((await live()).version).toBe(1);
    expect((await draftChanges(db, quizId))!.changes).toEqual(['Edited response “Renamed in draft”']);
  });
});
