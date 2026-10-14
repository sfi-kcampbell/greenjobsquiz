import { describe, expect, it } from "vitest";
import { isReferencedError } from "./errors";

/** Shaped like Drizzle's "Failed query" error with the Postgres error in `cause` (as seen on Neon). */
const drizzleError = (code: string) =>
  Object.assign(new Error('Failed query: delete from "quizzes" where "quizzes"."id" = $1 returning "id"'), {
    cause: Object.assign(new Error('update or delete on table "quizzes" violates RESTRICT setting of foreign key constraint'), {
      code,
      constraint: "submissions_quiz_id_quizzes_id_fk",
    }),
  });

describe("isReferencedError", () => {
  it("recognises a refused delete on newer Postgres (23001) and older (23503)", () => {
    expect(isReferencedError(drizzleError("23001"))).toBe(true);
    expect(isReferencedError(drizzleError("23503"))).toBe(true);
  });
  it("ignores other errors", () => {
    expect(isReferencedError(drizzleError("23505"))).toBe(false);
    expect(isReferencedError(new Error("boom"))).toBe(false);
    expect(isReferencedError(null)).toBe(false);
  });
});

describe("deleteQuiz on Neon", () => {
  it("turns a 23001 refusal into the friendly “has submissions” message", async () => {
    const { deleteQuiz } = await import("./quizzes");
    const fakeDb = {
      delete: () => ({ where: () => ({ returning: () => Promise.reject(drizzleError("23001")) }) }),
    } as unknown as Parameters<typeof deleteQuiz>[0];
    await expect(deleteQuiz(fakeDb, 1)).rejects.toMatchObject({
      name: "ContentError",
      code: "conflict",
      message: "This quiz has submissions, so it can't be deleted. Unpublish it instead.",
    });
  });
});
