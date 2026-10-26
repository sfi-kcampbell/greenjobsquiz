import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db/create";
import { getResultByShareToken, saveAnswers, submit } from "@/lib/public/sessions";
import { getPublishedQuiz } from "@/lib/public/structure";
import { resetTestDb, setupTestDb, teardownTestDb, TEST_DATABASE_URL } from "@/test/db";
import { createCategory } from "./categories";
import { ContentError } from "./errors";
import { saveQuestion } from "./questions";
import { duplicateQuiz, exportQuiz } from "./quiz-file";
import { createQuiz, setQuizStatus, updateQuizScoring } from "./quizzes";
import { saveResponseRow } from "./responses";
import {
  deleteGroup,
  deleteSubResponse,
  listSubResponses,
  reorderSubResponses,
  responseSubResponseIds,
  saveGroup,
  saveSubResponse,
  setResponseSubResponses,
} from "./sub-responses";
import { saveTranslations, setQuizLanguages } from "./translations";
import { questionInput, subResponseInput } from "./validation";
import { draftChanges, publishVersion, readWorkingContent, restoreToDraft } from "./versions";

describe.skipIf(!TEST_DATABASE_URL)("content: sub-responses (Postgres)", () => {
  let db: Database;
  let quizId: number;
  let q1: number;
  let a: Record<string, number>;
  let forester: number, analyst: number;
  let jobs: number;
  let s: Record<string, number>;

  beforeAll(async () => {
    db = await setupTestDb();
  });
  afterAll(teardownTestDb);

  const item = (groupId: number, title: string, extra: { descriptionHtml?: string; url?: string; id?: number } = {}) =>
    saveSubResponse(db, quizId, subResponseInput.parse({ id: extra.id ?? null, groupId, title, descriptionHtml: extra.descriptionHtml ?? null, url: extra.url ?? "" }));

  beforeEach(async () => {
    await resetTestDb();
    quizId = await createQuiz(db, { title: "Green Jobs", slug: "green-jobs" }, "a@example.org");
    const outd = await createCategory(db, quizId, { name: "Outdoors", abbr: "OUTD", color: "#3f7d4e", importance: 1 });
    const anly = await createCategory(db, quizId, { name: "Analytical", abbr: "ANLY", color: "#2f6690", importance: 1 });
    const r = await saveQuestion(
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
          { key: "k0", id: null, label: "Hike", bodyHtml: null, weights: { [outd]: 3, [anly]: 1 } },
          { key: "k1", id: null, label: "Spreadsheet", bodyHtml: null, weights: { [anly]: 3 } },
        ],
      }),
    );
    q1 = r.questionId;
    a = { hike: r.answerIds.k0, sheet: r.answerIds.k1 };
    forester = await saveResponseRow(db, quizId, { id: null, title: "Forester", weights: { [outd]: 5 } });
    analyst = await saveResponseRow(db, quizId, { id: null, title: "Analyst", weights: { [anly]: 5 } });
    jobs = await saveGroup(db, quizId, { id: null, name: "Jobs" });
    s = {
      dj: await item(jobs, "DJ", { descriptionHtml: "<p>Play <strong>music</strong></p><script>x</script>", url: "https://example.org/dj" }),
      sales: await item(jobs, "Sales"),
      teacher: await item(jobs, "Teacher"),
      ranger: await item(jobs, "Ranger"),
    };
    await setQuizStatus(db, quizId, "published");
    await publishVersion(db, quizId, "a@example.org");
  });

  it("keeps group names unique, refuses to delete a group with items, and validates links", async () => {
    await expect(saveGroup(db, quizId, { id: null, name: "jobs" })).rejects.toMatchObject({ field: "name" });
    await expect(deleteGroup(db, quizId, jobs)).rejects.toBeInstanceOf(ContentError);
    const clubs = await saveGroup(db, quizId, { id: null, name: "Clubs" });
    await deleteGroup(db, quizId, clubs);
    expect(() => subResponseInput.parse({ id: null, groupId: jobs, title: "X", descriptionHtml: null, url: "ftp://x" })).toThrow();
    const other = await createQuiz(db, { title: "Other", slug: "other" }, "a@example.org");
    const otherGroup = await saveGroup(db, other, { id: null, name: "Jobs" }); // names are per quiz
    await expect(saveSubResponse(db, quizId, subResponseInput.parse({ id: null, groupId: otherGroup, title: "X", descriptionHtml: null, url: "" }))).rejects.toMatchObject({
      field: "groupId",
    });
  });

  it("links items to several responses, each in its own order, and deleting an item unlinks it", async () => {
    await setResponseSubResponses(db, quizId, forester, [s.teacher, s.dj, s.ranger]);
    await setResponseSubResponses(db, quizId, analyst, [s.sales, s.dj, s.teacher]);
    expect(await responseSubResponseIds(db, forester)).toEqual([s.teacher, s.dj, s.ranger]);
    const dj = (await listSubResponses(db, quizId)).find((x) => x.id === s.dj)!;
    expect(dj.usedBy.map((r) => r.title)).toEqual(["Forester", "Analyst"]);

    await expect(setResponseSubResponses(db, quizId, forester, [999999])).rejects.toBeInstanceOf(ContentError);
    await deleteSubResponse(db, quizId, s.dj);
    expect(await responseSubResponseIds(db, forester)).toEqual([s.teacher, s.ranger]);

    await reorderSubResponses(db, quizId, jobs, [s.ranger, s.teacher, s.sales]);
    expect((await listSubResponses(db, quizId)).map((x) => x.title)).toEqual(["Ranger", "Teacher", "Sales"]);
  });

  it("is a draft until published, then shows all for the best match and the limit for runners-up", async () => {
    await setResponseSubResponses(db, quizId, forester, [s.teacher, s.dj, s.ranger]);
    await setResponseSubResponses(db, quizId, analyst, [s.sales, s.dj, s.teacher]);
    await updateQuizScoring(db, quizId, { runnersUpCount: 2, subResponseLimit: 1, normalizePerCategory: true, defaultResultId: null });
    expect((await draftChanges(db, quizId))!.changes).toEqual([
      "Changed scoring settings",
      "Changed the sub-responses for response “Forester”",
      "Changed the sub-responses for response “Analyst”",
    ]);

    const take = async () => {
      const quiz = (await getPublishedQuiz(db, { id: quizId }))!;
      const first = await saveAnswers(db, quiz, { tokenHash: null, entries: [{ questionId: q1, answerIds: [a.hike] }] });
      return (await getResultByShareToken(db, (await submit(db, quiz, { tokenHash: first.tokenHash })).shareToken))!;
    };
    expect((await take()).match!.subResponses).toEqual([]); // not published yet

    await publishVersion(db, quizId, "a@example.org");
    const result = await take();
    expect(result.match!.title).toBe("Forester");
    expect(result.match!.subResponses).toEqual([
      {
        group: "Jobs",
        items: [
          { title: "Teacher", descriptionHtml: null, url: null },
          { title: "DJ", descriptionHtml: "<p>Play <strong>music</strong></p>", url: "https://example.org/dj" },
          { title: "Ranger", descriptionHtml: null, url: null },
        ],
      },
    ]);
    expect(result.runnersUp[0]).toMatchObject({ title: "Analyst", subResponses: [{ group: "Jobs", items: [{ title: "Sales" }] }] });

    await updateQuizScoring(db, quizId, { runnersUpCount: 2, subResponseLimit: 0, normalizePerCategory: true, defaultResultId: null });
    await publishVersion(db, quizId, "a@example.org");
    const none = await take();
    expect(none.runnersUp[0].subResponses).toEqual([]);
    expect(none.match!.subResponses[0].items).toHaveLength(3);
  });

  it("translates group names and items on the result", async () => {
    await setResponseSubResponses(db, quizId, forester, [s.dj]);
    await saveTranslations(db, quizId, "es", [
      { key: `group:${jobs}:name`, text: "Empleos" },
      { key: `subresponse:${s.dj}:title`, text: "Pinchadiscos" },
    ], await readWorkingContent(db, quizId));
    await setQuizLanguages(db, quizId, ["es"], {});
    await publishVersion(db, quizId, "a@example.org");
    const quiz = (await getPublishedQuiz(db, { id: quizId }, { locale: "es" }))!;
    const first = await saveAnswers(db, quiz, { tokenHash: null, entries: [{ questionId: q1, answerIds: [a.hike] }] });
    const result = (await getResultByShareToken(db, (await submit(db, quiz, { tokenHash: first.tokenHash })).shareToken))!;
    expect(result.match!.subResponses).toEqual([{ group: "Empleos", items: [{ title: "Pinchadiscos", descriptionHtml: "<p>Play <strong>music</strong></p>", url: "https://example.org/dj" }] }]);
  });

  it("restores a version's sub-responses, and carries them through export and duplicate", async () => {
    await setResponseSubResponses(db, quizId, forester, [s.teacher, s.dj]);
    await publishVersion(db, quizId, "a@example.org");
    // Change everything in the draft, then restore version 2.
    await deleteSubResponse(db, quizId, s.dj);
    await item(jobs, "Teacher (secondary)", { id: s.teacher });
    await saveGroup(db, quizId, { id: jobs, name: "Careers" });
    await restoreToDraft(db, quizId, 2);
    const restored = await readWorkingContent(db, quizId);
    expect(restored.groups.map((g) => g.name)).toEqual(["Jobs"]);
    expect(restored.subResponses.map((x) => x.title)).toEqual(["DJ", "Sales", "Teacher", "Ranger"]);
    expect(restored.responses.find((r) => r.id === forester)!.subResponseIds).toEqual([s.teacher, s.dj]);
    expect((await draftChanges(db, quizId))!.changes).toEqual([]);

    const file = await exportQuiz(db, quizId);
    expect(file.subResponseGroups).toEqual([{ key: "g1", name: "Jobs", translations: {} }]);
    expect(file.subResponses.map((x) => x.title)).toEqual(["DJ", "Sales", "Teacher", "Ranger"]);
    expect(file.responses.find((r) => r.title === "Forester")!.subResponses).toEqual(["s3", "s1"]);

    const copy = await duplicateQuiz(db, quizId, "a@example.org");
    const copied = await readWorkingContent(db, copy);
    const titleOf = (id: number) => copied.subResponses.find((x) => x.id === id)?.title;
    expect(copied.responses.find((r) => r.title === "Forester")!.subResponseIds.map(titleOf)).toEqual(["Teacher", "DJ"]);
    expect(copied.subResponses.find((x) => x.title === "DJ")).toMatchObject({ descriptionHtml: "<p>Play <strong>music</strong></p>", url: "https://example.org/dj" });
  });
});
