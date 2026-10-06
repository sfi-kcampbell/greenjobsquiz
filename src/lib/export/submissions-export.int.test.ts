import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { parseListQuery } from "@/lib/admin/submissions";
import { createCategory, deleteCategory } from "@/lib/content/categories";
import { saveQuestion } from "@/lib/content/questions";
import { createQuiz, setQuizStatus } from "@/lib/content/quizzes";
import { saveResponseRow } from "@/lib/content/responses";
import { questionInput } from "@/lib/content/validation";
import type { Database } from "@/lib/db/create";
import { submissions } from "@/lib/db/schema";
import { saveAnswers, submit } from "@/lib/public/sessions";
import { getPublishedQuiz, type PublicQuiz } from "@/lib/public/structure";
import { resetTestDb, setupTestDb, teardownTestDb, TEST_DATABASE_URL } from "@/test/db";
import { csvRow } from "./csv";
import { answerDetails, exportBatches, LONG_HEADER, longRows, wideCategories, wideHeader, wideRow } from "./submissions-export";

const EVIL = "=cmd|' /C calc'!A0";

describe.skipIf(!TEST_DATABASE_URL)("export: submissions (Postgres)", () => {
  let db: Database;
  let quiz: PublicQuiz;
  let outd: number, anly: number, extra: number;
  let q1: number, q2: number;
  let a: Record<string, number>;

  beforeAll(async () => {
    db = await setupTestDb();
  });
  afterAll(teardownTestDb);

  async function take(picks: [number, number[]][], email?: string) {
    const first = await saveAnswers(db, quiz, { tokenHash: null, entries: picks.map(([questionId, answerIds]) => ({ questionId, answerIds })) });
    return submit(db, quiz, { tokenHash: first.tokenHash, email: email ?? null });
  }

  beforeEach(async () => {
    await resetTestDb();
    const id = await createQuiz(db, { title: "Green Jobs", slug: "green-jobs" }, "a@example.org");
    outd = await createCategory(db, id, { name: "Outdoors", abbr: "OUTD", color: "#3f7d4e", importance: 1 });
    anly = await createCategory(db, id, { name: "Analytical", abbr: "ANLY", color: "#2f6690", importance: 1 });
    extra = await createCategory(db, id, { name: "Extra", abbr: "EXTR", color: "#8e4f9e", importance: 1 });
    const make = (title: string, type: "single" | "multi", answers: [string, string | null, Record<number, number>][]) =>
      saveQuestion(
        db,
        id,
        questionInput.parse({
          id: null,
          title,
          helpHtml: null,
          type,
          required: true,
          splitMulti: false,
          minSelect: 1,
          maxSelect: type === "multi" ? 2 : 1,
          answers: answers.map(([label, bodyHtml, weights], i) => ({ key: `k${i}`, id: null, label, bodyHtml, weights })),
        }),
      );
    const r1 = await make("Weekend?", "single", [
      ["Hike", "<p>Trails &amp; <strong>trees</strong></p>", { [outd]: 3, [extra]: 1 }],
      [EVIL, null, { [anly]: 3 }],
    ]);
    const r2 = await make("Tools?", "multi", [
      ["Saw", null, { [outd]: 2 }],
      ["Laptop", "<p>Code</p>", { [anly]: 2 }],
      ["Map", null, { [outd]: 1, [anly]: 1 }],
    ]);
    [q1, q2] = [r1.questionId, r2.questionId];
    a = { hike: r1.answerIds.k0, evil: r1.answerIds.k1, saw: r2.answerIds.k0, laptop: r2.answerIds.k1, map: r2.answerIds.k2 };
    await saveResponseRow(db, id, { id: null, title: "Forester", weights: { [outd]: 5 } });
    await saveResponseRow(db, id, { id: null, title: "@Analyst", weights: { [anly]: 5 } });
    await setQuizStatus(db, id, "published");
    quiz = (await getPublishedQuiz(db, { id }))!;
  });

  const all = async (params: Record<string, string>, size?: number) => {
    const out = [];
    for await (const batch of exportBatches(db, parseListQuery(params), size)) out.push(batch);
    return out;
  };

  it("wide: one row per attempt with snapshot category columns, including a category deleted since", async () => {
    await take([[q1, [a.hike]], [q2, [a.saw]]], "kim@example.org");
    await take([[q1, [a.evil]], [q2, [a.laptop, a.map]]]);
    await deleteCategory(db, quiz.id, extra);
    const query = parseListQuery({ quiz: String(quiz.id), sort: "date", dir: "asc" });
    const cats = await wideCategories(db, query);
    expect(cats.map((c) => c.label)).toEqual(["Outdoors", "Analytical", "Extra"]);
    const header = wideHeader(cats);
    expect(header.slice(-6)).toEqual(["Outdoors raw", "Outdoors normalized", "Analytical raw", "Analytical normalized", "Extra raw", "Extra normalized"]);

    const [batch] = await all({ quiz: String(quiz.id), sort: "date", dir: "asc" });
    const rows = batch.map((s) => wideRow(s, cats));
    expect(rows).toHaveLength(2);
    expect(rows[0].length).toBe(header.length);
    const stored = batch[0].scores as { categories: Record<string, { raw: number }> };
    expect(rows[0][header.indexOf("Outdoors raw")]).toBe(stored.categories[String(outd)].raw);
    expect(rows[0][header.indexOf("Email")]).toBe("kim@example.org");
    expect(rows[1][header.indexOf("Matched response")]).toBe("@Analyst");
    expect(csvRow(rows[1])).toContain(",'@Analyst,"); // guarded in the file
    expect(rows[0][header.indexOf("Date (UTC)")]).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  it("wide needs a quiz", async () => {
    await expect(wideCategories(db, parseListQuery({}))).rejects.toThrow(/quiz/);
  });

  it("long: one row per answered question, multi-select joined, details stripped, formulas guarded", async () => {
    await take([[q1, [a.evil]], [q2, [a.laptop, a.map]]]);
    const [batch] = await all({});
    const details = await answerDetails(db, batch);
    const rows = batch.flatMap((s) => longRows(s, details));
    expect(rows).toHaveLength(2);
    const col = (name: string) => LONG_HEADER.indexOf(name);
    expect(rows[0][col("Question")]).toBe("Weekend?");
    expect(rows[0][col("Answer(s)")]).toBe(EVIL);
    expect(csvRow(rows[0])).toContain(`'${EVIL}`);
    expect(rows[1][col("Answer(s)")]).toBe("Laptop; Map");
    expect(rows[1][col("Answer details (current)")]).toBe("Code");
    expect(rows[1][col("Contribution")]).toMatch(/Analytical \+\d/);
    expect(rows[0].length).toBe(LONG_HEADER.length);

    await take([[q1, [a.hike]], [q2, [a.saw]]]);
    const [again] = await all({});
    const d2 = await answerDetails(db, again);
    expect(d2.get(a.hike)).toBe("Trails & trees");
  });

  it("batches of 500 cover every matching row exactly once, in the list's order", async () => {
    await take([[q1, [a.hike]], [q2, [a.saw]]]);
    await db.execute(sql`
      insert into submissions (quiz_id, token_hash, attempt_no, result_id, result_title, raw_similarity, top_category_id, scores, ranked, answers, questions_answered, duration_seconds, engine_version, created_at)
      select quiz_id, token_hash, attempt_no, result_id, result_title, raw_similarity, top_category_id, scores, ranked, answers, questions_answered, duration_seconds, engine_version, created_at - (g || ' minutes')::interval
      from submissions, generate_series(1, 1233) g`);
    const batches = await all({}, 500);
    expect(batches.map((b) => b.length)).toEqual([500, 500, 234]);
    const ids = batches.flat().map((s) => s.id);
    expect(new Set(ids).size).toBe(1234);
    const times = batches.flat().map((s) => s.createdAt.getTime());
    expect(times.every((t, i) => i === 0 || times[i - 1] >= t)).toBe(true); // newest first, like the list
  });

  it("filters narrow the export like the list", async () => {
    await take([[q1, [a.hike]], [q2, [a.saw]]], "kim@example.org");
    await take([[q1, [a.evil]], [q2, [a.laptop]]], "lee@example.org");
    expect((await all({ q: "kim" })).flat().map((s) => s.email)).toEqual(["kim@example.org"]);
    await db.update(submissions).set({ createdAt: new Date("2025-01-01T00:00:00Z") }).where(eq(submissions.email, "lee@example.org"));
    expect((await all({ to: "2025-12-31" })).flat().map((s) => s.email)).toEqual(["lee@example.org"]);
    expect(await all({ q: "nobody" })).toEqual([]);
  });
});
