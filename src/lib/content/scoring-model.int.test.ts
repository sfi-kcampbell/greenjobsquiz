import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/create";
import { questions, results } from "@/lib/db/schema";
import { score } from "@/lib/scoring/engine";
import { resetTestDb, setupTestDb, teardownTestDb, TEST_DATABASE_URL } from "@/test/db";
import { createCategory } from "./categories";
import { ContentError } from "./errors";
import { saveQuestion } from "./questions";
import { createQuiz, getQuiz, updateQuizDelivery, updateQuizRespondentOptions, updateQuizScoring } from "./quizzes";
import { getAccessSettings, updateAccessSettings } from "./settings";
import { saveResponseRow } from "./responses";
import { loadScoringBundle } from "./scoring-model";
import { questionInput } from "./validation";

describe.skipIf(!TEST_DATABASE_URL)("content: scoring model (Postgres)", () => {
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
    outdoors = await createCategory(db, quizId, { name: "Outdoors", abbr: "OUTD", color: "#336699", importance: 2 });
    analytical = await createCategory(db, quizId, { name: "Analytical", abbr: "ANLY", color: "#336699", importance: 1 });
  });

  it("loads categories, questions, responses and settings into an engine model", async () => {
    const { answerIds, questionId } = await saveQuestion(
      db,
      quizId,
      questionInput.parse({
        id: null,
        title: "Rain?",
        helpHtml: null,
        type: "single",
        required: true,
        splitMulti: false,
        minSelect: 1,
        maxSelect: 1,
        answers: [
          { key: "a", id: null, label: "Love it", bodyHtml: null, weights: { [outdoors]: 3 } },
          { key: "b", id: null, label: "No", bodyHtml: null, weights: { [analytical]: 2 } },
        ],
      }),
    );
    const forester = await saveResponseRow(db, quizId, { id: null, title: "Forester", weights: { [outdoors]: 5 } });
    const analyst = await saveResponseRow(db, quizId, { id: null, title: "Analyst", weights: { [analytical]: 5 } });
    // An archived question and response must not appear.
    await db.insert(questions).values({ quizId, title: "Old", archivedAt: new Date() });
    await db.insert(results).values({ quizId, title: "Old", archivedAt: new Date() });

    const bundle = await loadScoringBundle(db, quizId);
    expect(bundle.model.categories).toEqual([
      { id: outdoors, importance: 2 },
      { id: analytical, importance: 1 },
    ]);
    expect(bundle.model.questions).toEqual([
      {
        id: questionId,
        type: "single",
        splitMulti: false,
        maxSelect: 1,
        answers: [
          { id: answerIds.a, weights: { [outdoors]: 3 } },
          { id: answerIds.b, weights: { [analytical]: 2 } },
        ],
      },
    ]);
    expect(bundle.model.results.map((r) => r.id)).toEqual([forester, analyst]);
    expect(bundle.health.names.questions[questionId]).toBe("1. Rain?");
    expect(bundle.settings).toEqual({ runnersUpCount: 2, normalizePerCategory: true, defaultResultId: null });

    const result = score(bundle.model, [{ questionId, answerIds: [answerIds.a] }]);
    expect(result.match?.resultId).toBe(forester);
  });

  it("updates respondent options and bumps the structure version", async () => {
    const v0 = (await getQuiz(db, quizId))!.structureVersion;
    await updateQuizRespondentOptions(db, quizId, { showProgress: false, autoAdvance: true, retakeAllowed: false });
    const quiz = (await getQuiz(db, quizId))!;
    expect([quiz.showProgress, quiz.autoAdvance, quiz.retakeAllowed]).toEqual([false, true, false]);
    expect(quiz.structureVersion).toBe(v0 + 1);
  });

  it("updates delivery settings and bumps the structure version", async () => {
    const v0 = (await getQuiz(db, quizId))!.structureVersion;
    await updateQuizDelivery(db, quizId, {
      layout: "single_page",
      layoutTemplate: "canvas",
      deliveryMode: "headless",
      headlessBaseUrl: "https://app.example.org",
    });
    const quiz = (await getQuiz(db, quizId))!;
    expect([quiz.layout, quiz.layoutTemplate, quiz.deliveryMode, quiz.headlessBaseUrl]).toEqual([
      "single_page",
      "canvas",
      "headless",
      "https://app.example.org",
    ]);
    expect(quiz.structureVersion).toBe(v0 + 1);
  });

  it("reads defaults, then creates and updates the settings row", async () => {
    expect(await getAccessSettings(db)).toEqual({ embedOrigins: [], corsOrigins: [] });
    await updateAccessSettings(db, { embedOrigins: ["https://a.org"], corsOrigins: [] });
    await updateAccessSettings(db, { embedOrigins: ["https://b.org"], corsOrigins: ["https://c.org"] });
    expect(await getAccessSettings(db)).toEqual({ embedOrigins: ["https://b.org"], corsOrigins: ["https://c.org"] });
  });

  it("updates scoring settings and rejects a fallback from another quiz", async () => {
    const mine = await saveResponseRow(db, quizId, { id: null, title: "Mine", weights: {} });
    const other = await createQuiz(db, { title: "Other", slug: "other" }, "a@example.org");
    const theirs = await saveResponseRow(db, other, { id: null, title: "Theirs", weights: {} });
    const v0 = (await getQuiz(db, quizId))!.structureVersion;

    await updateQuizScoring(db, quizId, { runnersUpCount: 1, normalizePerCategory: false, defaultResultId: mine });
    const quiz = (await getQuiz(db, quizId))!;
    expect([quiz.runnersUpCount, quiz.normalizePerCategory, quiz.defaultResultId]).toEqual([1, false, mine]);
    expect(quiz.structureVersion).toBe(v0 + 1);

    const error = await updateQuizScoring(db, quizId, { runnersUpCount: 1, normalizePerCategory: false, defaultResultId: theirs }).catch((e) => e);
    expect(error).toBeInstanceOf(ContentError);
    expect(error.field).toBe("defaultResultId");

    // Deleting the fallback response clears it (foreign key: set null).
    await db.delete(results).where(eq(results.id, mine));
    expect((await getQuiz(db, quizId))!.defaultResultId).toBeNull();
  });
});
