import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { parseListQuery } from "@/lib/admin/submissions";
import type { Database } from "@/lib/db/create";
import { quizSessions, submissions } from "@/lib/db/schema";
import { exportBatches, LONG_HEADER, longRows } from "@/lib/export/submissions-export";
import { getResultByShareToken, saveAnswers, submit } from "@/lib/public/sessions";
import { getPublishedQuiz, type PublicQuiz } from "@/lib/public/structure";
import { resetTestDb, setupTestDb, teardownTestDb, TEST_DATABASE_URL } from "@/test/db";
import { createCategory } from "./categories";
import { ContentError } from "./errors";
import { listQuestions, saveQuestion } from "./questions";
import { duplicateQuiz, exportQuiz, importQuiz } from "./quiz-file";
import { createQuiz, setQuizStatus } from "./quizzes";
import { saveResponseRow, updateResponseDetails } from "./responses";
import { saveTranslations, setQuizLanguages, translationEditor, translationStatus } from "./translations";
import { questionInput, responseDetailsInput } from "./validation";
import { draftChanges, publishVersion, readWorkingContent, restoreToDraft } from "./versions";

describe.skipIf(!TEST_DATABASE_URL)("content: translations and languages (Postgres)", () => {
  let db: Database;
  let quizId: number;
  let outd: number;
  let q1: number, q2: number;
  let a: Record<string, number>;
  let forester: number;

  beforeAll(async () => {
    db = await setupTestDb();
  });
  afterAll(teardownTestDb);

  const question = (id: number | null, title: string, answers: [string, number | null, Record<number, number>][]) =>
    questionInput.parse({
      id,
      title,
      helpHtml: null,
      type: "single",
      required: true,
      splitMulti: false,
      minSelect: 1,
      maxSelect: 1,
      answers: answers.map(([label, aid, weights], i) => ({ key: `k${i}`, id: aid, label, bodyHtml: null, weights })),
    });

  beforeEach(async () => {
    await resetTestDb();
    quizId = await createQuiz(db, { title: "Green Jobs", slug: "green-jobs" }, "a@example.org");
    outd = await createCategory(db, quizId, { name: "Outdoors", abbr: "OUTD", color: "#3f7d4e", importance: 1 });
    const anly = await createCategory(db, quizId, { name: "Analytical", abbr: "ANLY", color: "#2f6690", importance: 1 });
    const r1 = await saveQuestion(db, quizId, question(null, "Weekend?", [["Hike", null, { [outd]: 3 }], ["Spreadsheet", null, { [anly]: 3 }]]));
    const r2 = await saveQuestion(db, quizId, question(null, "Tools?", [["Saw", null, { [outd]: 2 }], ["Laptop", null, { [anly]: 2 }]]));
    [q1, q2] = [r1.questionId, r2.questionId];
    a = { hike: r1.answerIds.k0, sheet: r1.answerIds.k1, saw: r2.answerIds.k0, laptop: r2.answerIds.k1 };
    forester = await saveResponseRow(db, quizId, { id: null, title: "Forester", weights: { [outd]: 5 } });
    await updateResponseDetails(
      db,
      quizId,
      forester,
      responseDetailsInput.parse({ title: "Forester", excerpt: "Trees!", bodyHtml: "<p>Forests</p>", ctaUrl: "https://example.org", ctaLabel: "More", weights: { [outd]: 5 } }),
    );
    await saveResponseRow(db, quizId, { id: null, title: "Analyst", weights: { [anly]: 5 } });
    await setQuizStatus(db, quizId, "published");
  });

  const translate = async (locale: string, entries: Record<string, string>) =>
    saveTranslations(db, quizId, locale, Object.entries(entries).map(([key, text]) => ({ key, text })), await readWorkingContent(db, quizId));

  async function spanish() {
    await translate("es", {
      "quiz:0:title": "Empleos verdes",
      [`question:${q1}:title`]: "¿Fin de semana?",
      [`answer:${a.hike}:label`]: "Caminata",
      [`response:${forester}:title`]: "Guardabosques",
      [`response:${forester}:bodyHtml`]: "<p>Bosques</p><script>alert(1)</script>",
      [`category:${outd}:name`]: "Aire libre",
    });
    await setQuizLanguages(db, quizId, ["es"], {});
    await publishVersion(db, quizId, "a@example.org");
  }

  const es = async () => (await getPublishedQuiz(db, { id: quizId }, { locale: "es" }))!;

  it("serves translations once published and offered, falling back to English field by field", async () => {
    await publishVersion(db, quizId, "a@example.org");
    await translate("es", { [`question:${q1}:title`]: "¿Fin de semana?" });
    // A draft: not live yet, and Spanish isn't offered yet either.
    expect((await draftChanges(db, quizId))!.changes).toEqual(["Updated Spanish translations (1)"]);
    expect((await es()).locale).toBe("en");

    await spanish();
    const quiz = await es();
    expect(quiz.locale).toBe("es");
    expect(quiz.languages).toEqual(["en", "es"]);
    expect(quiz.title).toBe("Empleos verdes");
    expect(quiz.questions[0].title).toBe("¿Fin de semana?");
    expect(quiz.questions[0].answers.map((x) => x.label)).toEqual(["Caminata", "Spreadsheet"]);
    expect(quiz.questions[1].title).toBe("Tools?");
    expect(JSON.stringify(quiz)).not.toContain("weights");
    // French isn't offered: English. The browser's language picks Spanish.
    expect((await getPublishedQuiz(db, { id: quizId }, { locale: "fr" }))!.locale).toBe("en");
    expect((await getPublishedQuiz(db, { id: quizId }, { acceptLanguage: "es-MX,es;q=0.9" }))!.title).toBe("Empleos verdes");
  });

  it("sanitizes, clears and refuses translations as it should", async () => {
    await spanish();
    const content = await readWorkingContent(db, quizId);
    expect(content.translations.es[`response:${forester}:bodyHtml`]).toBe("<p>Bosques</p>");
    await translate("es", { [`answer:${a.hike}:label`]: "  " });
    expect((await readWorkingContent(db, quizId)).translations.es[`answer:${a.hike}:label`]).toBeUndefined();
    await expect(translate("es", { "question:999999:title": "x" })).rejects.toBeInstanceOf(ContentError);
    await expect(translate("en", { "quiz:0:title": "x" })).rejects.toBeInstanceOf(ContentError);
    await expect(translate("de", { "quiz:0:title": "x" })).rejects.toBeInstanceOf(ContentError);
    await expect(translate("es", { "quiz:0:title": "x".repeat(201) })).rejects.toThrow(/under 200/);
  });

  it("flags a translation for review when its English changes, until it's saved again", async () => {
    await spanish();
    const [q] = (await listQuestions(db, quizId)).filter((x) => x.id === q1);
    await saveQuestion(db, quizId, question(q1, "Your weekend?", q.answers.map((x) => [x.label, x.id, x.weights] as [string, number, Record<number, number>])));
    let content = await readWorkingContent(db, quizId);
    const field = (await translationEditor(db, quizId, "es", content)).find((f) => f.key === `question:${q1}:title`)!;
    expect(field).toMatchObject({ text: "Your weekend?", translation: "¿Fin de semana?", stale: true });
    expect((await translationStatus(db, quizId, content)).es).toMatchObject({ done: 6, stale: 1 });

    await translate("es", { [`question:${q1}:title`]: "¿Tu fin de semana?" });
    content = await readWorkingContent(db, quizId);
    expect((await translationStatus(db, quizId, content)).es.stale).toBe(0);
  });

  it("records the language on the attempt and submission, keeps snapshots in English, and shows the result in it", async () => {
    await spanish();
    const quiz: PublicQuiz = await es();
    const first = await saveAnswers(db, quiz, { tokenHash: null, entries: [{ questionId: q1, answerIds: [a.hike] }] });
    const [session] = await db.select().from(quizSessions).where(eq(quizSessions.tokenHash, first.tokenHash));
    expect(session.locale).toBe("es");

    // Switching to English mid-quiz keeps the answers.
    const english = (await getPublishedQuiz(db, { id: quizId }))!;
    const second = await saveAnswers(db, english, { tokenHash: first.tokenHash, entries: [{ questionId: q2, answerIds: [a.saw] }] });
    expect(second.view.answers).toEqual({ [q1]: [a.hike], [q2]: [a.saw] });
    // …and back to Spanish to finish.
    await saveAnswers(db, quiz, { tokenHash: first.tokenHash, entries: [{ questionId: q2, answerIds: [a.saw] }] });
    const done = await submit(db, quiz, { tokenHash: first.tokenHash });

    const [s] = await db.select().from(submissions).where(eq(submissions.id, done.submissionId));
    expect(s.locale).toBe("es");
    expect(s.resultTitle).toBe("Forester");
    expect((s.answers as { questionTitle: string; answers: { label: string }[] }[])[0]).toMatchObject({ questionTitle: "Weekend?", answers: [{ label: "Hike" }] });

    const result = (await getResultByShareToken(db, done.shareToken))!;
    expect(result.locale).toBe("es");
    expect(result.quiz.title).toBe("Empleos verdes");
    expect(result.match).toMatchObject({ title: "Guardabosques", bodyHtml: "<p>Bosques</p>", excerpt: "Trees!" });
    expect(Object.values(result.scores).map((c) => c.label)).toContain("Aire libre");
    // Another offered language on request; one that isn't offered keeps the submission's.
    expect((await getResultByShareToken(db, done.shareToken, { locale: "en" }))!.match!.title).toBe("Forester");
    expect((await getResultByShareToken(db, done.shareToken, { locale: "fr" }))!.locale).toBe("es");

    const col = (name: string) => LONG_HEADER.indexOf(name);
    const rows = [];
    for await (const batch of exportBatches(db, parseListQuery({ lang: "es" }))) rows.push(...batch.flatMap((x) => longRows(x, new Map())));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r[col("Language")] === "es")).toBe(true);
    const none = [];
    for await (const batch of exportBatches(db, parseListQuery({ lang: "fr" }))) none.push(...batch);
    expect(none).toEqual([]);
  });

  it("keeps each version's translations, and restores them to the draft", async () => {
    await spanish();
    await translate("es", { [`question:${q1}:title`]: "¿Y el fin de semana?" });
    await publishVersion(db, quizId, "a@example.org");
    expect((await es()).questions[0].title).toBe("¿Y el fin de semana?");
    expect((await getPublishedQuiz(db, { id: quizId }, { version: 1, locale: "es" }))!.questions[0].title).toBe("¿Fin de semana?");

    await restoreToDraft(db, quizId, 1);
    const content = await readWorkingContent(db, quizId);
    expect(content.translations.es[`question:${q1}:title`]).toBe("¿Fin de semana?");
    expect((await translationStatus(db, quizId, content)).es.stale).toBe(0);
  });

  it("exports, imports and duplicates languages and translations", async () => {
    await spanish();
    await setQuizLanguages(db, quizId, ["es", "fr", "de"], { es: "Un bosque", de: "Wald" });
    const file = await exportQuiz(db, quizId);
    expect(file.quiz.languages).toEqual(["es", "fr"]);
    expect(file.quiz.translations).toEqual({ es: { title: "Empleos verdes" } });
    expect(file.questions[0].translations).toEqual({ es: { title: "¿Fin de semana?" } });
    expect(file.questions[0].answers[0].translations).toEqual({ es: { label: "Caminata" } });

    const copy = await duplicateQuiz(db, quizId, "a@example.org");
    const copied = await readWorkingContent(db, copy);
    const hike = copied.questions[0].answers[0].id;
    expect(copied.translations.es[`answer:${hike}:label`]).toBe("Caminata");
    expect(copied.translations.es[`response:${copied.responses[0].id}:bodyHtml`]).toBe("<p>Bosques</p>");
    expect(Object.keys(copied.translations.es)).toHaveLength(6);

    // Older files have no translations; unsupported languages are dropped.
    const plain = await importQuiz(
      db,
      { ...file, quiz: { ...file.quiz, languages: ["de"], translations: { de: { title: "Grüne Jobs" } } } },
      { createdBy: "a@example.org", copy: true },
    );
    const imported = await readWorkingContent(db, plain);
    expect(imported.translations.de).toBeUndefined();
    expect(imported.translations.es).toBeDefined();
  });
});
