import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditActors, listAudit, recordAudit } from "@/lib/audit";
import type { Database } from "@/lib/db/create";
import { quizzes } from "@/lib/db/schema";
import { storeMedia } from "@/lib/media/media";
import { score } from "@/lib/scoring/engine";
import { resetTestDb, setupTestDb, teardownTestDb, TEST_DATABASE_URL } from "@/test/db";
import { createCategory } from "./categories";
import { saveQuestion } from "./questions";
import { createQuiz, getQuiz, updateQuiz, updateQuizBanner, updateQuizCss, updateQuizScoring } from "./quizzes";
import { duplicateQuiz, exportQuiz, importQuiz, parseQuizFile, type QuizFile } from "./quiz-file";
import { saveResponseRow, updateResponseDetails } from "./responses";
import { loadScoringBundle } from "./scoring-model";
import { quizBannerInput, questionInput } from "./validation";

function png(w: number, h: number, salt = 0): Uint8Array {
  const b = new Uint8Array(40);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  b[39] = salt;
  return b;
}

/** Everything that should survive a round trip (no ids, slug, title or timestamps). */
const comparable = (f: QuizFile) => {
  const { exportedAt: _a, quiz, ...rest } = f;
  const { slug: _s, title: _t, ...settings } = quiz;
  return { ...rest, quiz: settings };
};

describe.skipIf(!TEST_DATABASE_URL)("quiz files, duplicate and audit (Postgres)", () => {
  let db: Database;
  let quizId: number;
  let imageId: string;

  beforeAll(async () => {
    db = await setupTestDb();
  });
  afterAll(teardownTestDb);

  beforeEach(async () => {
    await resetTestDb();
    quizId = await createQuiz(db, { title: "Green Jobs", slug: "green-jobs" }, "a@example.org");
    imageId = (await storeMedia(db, { bytes: png(1200, 300), filename: "banner.png" })).id;
    await updateQuiz(db, quizId, { title: "Green Jobs", slug: "green-jobs", introHtml: `<p>Hi</p><img src="/media/${imageId}" alt="Trees" width="1200" height="300" />` });
    const outd = await createCategory(db, quizId, { name: "Outdoors", abbr: "OUTD", color: "#3f7d4e", importance: 1 });
    const anly = await createCategory(db, quizId, { name: "Analytical", abbr: "ANLY", color: "#2f6690", importance: 1.5 });
    const q = (title: string, type: "single" | "multi", answers: [string, Record<number, number>][]) =>
      saveQuestion(
        db,
        quizId,
        questionInput.parse({
          id: null,
          title,
          helpHtml: type === "multi" ? "<p>Pick two</p>" : null,
          type,
          required: true,
          splitMulti: false,
          minSelect: 1,
          maxSelect: type === "multi" ? 2 : 1,
          answers: answers.map(([label, weights], i) => ({ key: `k${i}`, id: null, label, bodyHtml: i === 0 ? "<p>Details</p>" : null, weights })),
        }),
      );
    await q("Weekend?", "single", [["Hike", { [outd]: 3 }], ["Code", { [anly]: 3, [outd]: -1 }]]);
    await q("Tools?", "multi", [["Saw", { [outd]: 2 }], ["Laptop", { [anly]: 2 }], ["Map", { [outd]: 1, [anly]: 1 }]]);
    const forester = await saveResponseRow(db, quizId, { id: null, title: "Forester", weights: { [outd]: 5 } });
    await saveResponseRow(db, quizId, { id: null, title: "Analyst", weights: { [anly]: 5 } });
    await updateResponseDetails(db, quizId, forester, {
      title: "Forester",
      excerpt: "Trees!",
      bodyHtml: "<p>About</p>",
      ctaUrl: "https://example.org/forester",
      ctaLabel: "Learn more",
      weights: { [outd]: 5 },
    });
    await updateQuizScoring(db, quizId, { runnersUpCount: 1, normalizePerCategory: false, defaultResultId: forester });
    await updateQuizBanner(db, quizId, quizBannerInput.parse({ mediaId: imageId, alt: "Students planting trees" }));
    await updateQuizCss(db, quizId, `.pltq-banner { background: url(/media/${imageId}) }`);
  });

  it("export → import → export is identical, and scores the same", async () => {
    const file = await exportQuiz(db, quizId);
    expect(file.categories.map((c) => c.key)).toEqual(["c1", "c2"]);
    expect(Object.keys(file.images)).toEqual([imageId]);
    expect(file.quiz.defaultResponse).toBe("r1");

    // Through JSON text, like a real download and upload.
    const copyId = await importQuiz(db, parseQuizFile(JSON.stringify(file)), { createdBy: "b@example.org" });
    const copy = (await getQuiz(db, copyId))!;
    expect(copy.status).toBe("draft");
    expect(copy.slug).toBe("green-jobs-2"); // the original keeps its slug
    expect(copy.bannerMediaId).toBe(imageId); // same bytes → same stored image
    expect(comparable(await exportQuiz(db, copyId))).toEqual(comparable(file));

    // Same answers (by position) → same ranking.
    const a = await loadScoringBundle(db, quizId);
    const b = await loadScoringBundle(db, copyId);
    const pick = (bundle: typeof a, picks: number[][]) =>
      bundle.display.questions.map((q, i) => ({ questionId: q.id, answerIds: picks[i].map((j) => q.answers[j].id) }));
    for (const picks of [[[0], [0, 2]], [[1], [1]], [[1], [0, 1]]]) {
      const titleOf = (bundle: typeof a, id: number | undefined) => bundle.display.results.find((r) => r.id === id)?.title;
      const ra = score(a.model, pick(a, picks));
      const rb = score(b.model, pick(b, picks));
      expect(titleOf(b, rb.match?.resultId)).toBe(titleOf(a, ra.match?.resultId));
      expect(rb.match?.raw).toBeCloseTo(ra.match?.raw ?? 0, 10);
    }
  });

  it("duplicate makes a draft copy with its own slug, never copying submissions", async () => {
    const id1 = await duplicateQuiz(db, quizId, "b@example.org");
    const id2 = await duplicateQuiz(db, quizId, "b@example.org");
    const [c1, c2] = [(await getQuiz(db, id1))!, (await getQuiz(db, id2))!];
    expect([c1.title, c1.slug, c1.status, c1.createdBy]).toEqual(["Copy of Green Jobs", "green-jobs-copy", "draft", "b@example.org"]);
    expect(c2.slug).toBe("green-jobs-copy-2");
    expect(c1.customCss).toContain(`/media/${imageId}`);
  });

  it("refuses bad files with a clear message, and sanitizes what it keeps", async () => {
    expect(() => parseQuizFile("not json")).toThrow(/isn't valid JSON/);
    expect(() => parseQuizFile(JSON.stringify({ format: "other" }))).toThrow(/isn't a quiz file/);
    const file = await exportQuiz(db, quizId);
    const withBadWeight = structuredClone(file);
    withBadWeight.questions[0].answers[0].weights = { zz: 2 };
    expect(() => parseQuizFile(JSON.stringify(withBadWeight))).toThrow(/category that isn't in the file/);

    const svg = structuredClone(file);
    svg.images[imageId].data = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>").toString("base64");
    await expect(importQuiz(db, svg, { createdBy: "b@example.org" })).rejects.toThrow(/SVG isn't allowed/);

    const css = structuredClone(file);
    css.quiz.customCss = "a{}</style><script>alert(1)</script>";
    await expect(importQuiz(db, css, { createdBy: "b@example.org" })).rejects.toThrow(/CSS/);

    const xss = structuredClone(file);
    xss.questions[0].helpHtml = `<p onclick="x()">Hi</p><script>alert(1)</script><img src="https://evil.example/p.gif">`;
    const id = await importQuiz(db, xss, { createdBy: "b@example.org" });
    expect((await exportQuiz(db, id)).questions[0].helpHtml).toBe("<p>Hi</p>");
    const before = await db.$count(quizzes);
    await expect(importQuiz(db, css, { createdBy: "b@example.org" })).rejects.toThrow();
    expect(await db.$count(quizzes)).toBe(before); // nothing half-imported
  });

  it("records and filters activity; Admins only see quiz events", async () => {
    await recordAudit(db, { email: "a@example.org" }, { scope: "quiz", action: "quiz.update", quizId, summary: "Edited" });
    await recordAudit(db, { email: "s@example.org" }, { scope: "staff", action: "staff.invite", summary: "Invited x" });
    await recordAudit(db, { email: "s@example.org" }, { scope: "settings", action: "settings.css", summary: "CSS" });
    const all = await listAudit(db, { superAdmin: true });
    expect(all.total).toBe(3);
    expect(all.rows[0].summary).toBe("CSS"); // newest first
    expect(all.rows.find((r) => r.action === "quiz.update")?.quizTitle).toBe("Green Jobs");
    expect((await listAudit(db, { superAdmin: false })).rows.map((r) => r.scope)).toEqual(["quiz"]);
    expect((await listAudit(db, { superAdmin: true, actor: "S@example.org " })).total).toBe(2);
    expect((await listAudit(db, { superAdmin: true, quizId })).total).toBe(1);
    expect((await listAudit(db, { superAdmin: true, from: "2999-01-01" })).total).toBe(0);
    expect(await auditActors(db, false)).toEqual(["a@example.org"]);

    // The quiz's title stays on its events after deletion.
    await db.delete(quizzes).where(eq(quizzes.id, quizId));
    const kept = (await listAudit(db, { superAdmin: true, scope: "quiz" })).rows[0];
    expect([kept.quizId, kept.quizTitle]).toEqual([null, "Green Jobs"]);
  });
});
