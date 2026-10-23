/**
 * Sub-responses: items listed under responses (e.g. jobs under a personality
 * type), in groups that become headings ("Jobs"). They're set up once per quiz
 * and attached to any number of responses, each response with its own order.
 * Like all content, changes are a draft until published.
 */
import { and, asc, count, eq, inArray, isNull, max, sql } from "drizzle-orm";
import type { Database, Executor, Tx } from "@/lib/db/create";
import { resultSubResponses, results, subResponseGroups, subResponses } from "@/lib/db/schema";
import { ContentError, pgError, PG_UNIQUE_VIOLATION } from "./errors";
import { bumpStructureVersion, lockQuiz } from "./quizzes";
import {
  MAX_SUB_RESPONSE_GROUPS,
  MAX_SUB_RESPONSES,
  MAX_SUB_RESPONSES_PER_RESPONSE,
  type SubResponseGroupInput,
  type SubResponseInput,
} from "./validation";

export type SubResponseGroupView = { id: number; name: string; position: number };
export type SubResponseView = {
  id: number;
  groupId: number;
  title: string;
  description: string | null;
  url: string | null;
  position: number;
  /** The responses that list it, in response order. */
  usedBy: { id: number; title: string }[];
};

export async function listGroups(db: Executor, quizId: number): Promise<SubResponseGroupView[]> {
  return db
    .select({ id: subResponseGroups.id, name: subResponseGroups.name, position: subResponseGroups.position })
    .from(subResponseGroups)
    .where(eq(subResponseGroups.quizId, quizId))
    .orderBy(asc(subResponseGroups.position), asc(subResponseGroups.id));
}

/** Every sub-response, in group order then position. */
export async function listSubResponses(db: Executor, quizId: number): Promise<SubResponseView[]> {
  const groups = await listGroups(db, quizId);
  const groupOrder = new Map(groups.map((g, i) => [g.id, i]));
  const rows = await db.select().from(subResponses).where(eq(subResponses.quizId, quizId)).orderBy(asc(subResponses.position), asc(subResponses.id));
  const links = rows.length
    ? await db
        .select({ subResponseId: resultSubResponses.subResponseId, id: results.id, title: results.title, position: results.position })
        .from(resultSubResponses)
        .innerJoin(results, eq(results.id, resultSubResponses.resultId))
        .where(and(inArray(resultSubResponses.subResponseId, rows.map((r) => r.id)), isNull(results.archivedAt)))
        .orderBy(asc(results.position), asc(results.id))
    : [];
  return rows
    .map((r) => ({
      id: r.id,
      groupId: r.groupId,
      title: r.title,
      description: r.description,
      url: r.url,
      position: r.position,
      usedBy: links.filter((l) => l.subResponseId === r.id).map(({ id, title }) => ({ id, title })),
    }))
    .sort((a, b) => (groupOrder.get(a.groupId) ?? 0) - (groupOrder.get(b.groupId) ?? 0) || a.position - b.position || a.id - b.id);
}

/* --------------------------------- Groups -------------------------------- */

export async function saveGroup(db: Database, quizId: number, input: SubResponseGroupInput): Promise<number> {
  try {
    return await db.transaction(async (tx) => {
      await lockQuiz(tx, quizId);
      let id: number;
      if (input.id === null) {
        const [{ n }] = await tx.select({ n: count() }).from(subResponseGroups).where(eq(subResponseGroups.quizId, quizId));
        if (n >= MAX_SUB_RESPONSE_GROUPS) throw new ContentError("limit", `A quiz can have at most ${MAX_SUB_RESPONSE_GROUPS} groups.`);
        const [{ last }] = await tx.select({ last: max(subResponseGroups.position) }).from(subResponseGroups).where(eq(subResponseGroups.quizId, quizId));
        const [row] = await tx.insert(subResponseGroups).values({ quizId, name: input.name, position: (last ?? -1) + 1 }).returning({ id: subResponseGroups.id });
        id = row.id;
      } else {
        const done = await tx
          .update(subResponseGroups)
          .set({ name: input.name })
          .where(and(eq(subResponseGroups.id, input.id), eq(subResponseGroups.quizId, quizId)))
          .returning({ id: subResponseGroups.id });
        if (!done.length) throw new ContentError("not_found", "That group no longer exists.");
        id = input.id;
      }
      await bumpStructureVersion(tx, quizId);
      return id;
    });
  } catch (error) {
    if (pgError(error)?.code === PG_UNIQUE_VIOLATION) throw new ContentError("conflict", "There's already a group with that name.", "name");
    throw error;
  }
}

/** Only an empty group can be deleted (so nothing disappears by accident). */
export async function deleteGroup(db: Database, quizId: number, id: number): Promise<void> {
  await db.transaction(async (tx) => {
    await lockQuiz(tx, quizId);
    const [{ n }] = await tx.select({ n: count() }).from(subResponses).where(eq(subResponses.groupId, id));
    if (n > 0) throw new ContentError("conflict", "Move or delete this group's sub-responses first.");
    await tx.delete(subResponseGroups).where(and(eq(subResponseGroups.id, id), eq(subResponseGroups.quizId, quizId)));
    await bumpStructureVersion(tx, quizId);
  });
}

/** Sets `position` from the order of `ids` (which must be exactly `existing`). */
async function renumber(tx: Tx, table: typeof subResponseGroups | typeof subResponses, existing: number[], ids: number[], what: string) {
  const set = new Set(ids);
  if (set.size !== ids.length || set.size !== existing.length || ids.some((id) => !existing.includes(id))) {
    throw new ContentError("invalid", `The ${what} changed while you were reordering. Reload and try again.`);
  }
  if (!ids.length) return;
  const cases = sql.join(ids.map((id, i) => sql`when ${id}::int then ${i}::int`), sql` `);
  await tx.update(table).set({ position: sql`case ${table.id} ${cases} end` }).where(inArray(table.id, ids));
}

export async function reorderGroups(db: Database, quizId: number, ids: number[]): Promise<void> {
  await db.transaction(async (tx) => {
    await lockQuiz(tx, quizId);
    const existing = (await tx.select({ id: subResponseGroups.id }).from(subResponseGroups).where(eq(subResponseGroups.quizId, quizId))).map((r) => r.id);
    await renumber(tx, subResponseGroups, existing, ids, "groups");
    await bumpStructureVersion(tx, quizId);
  });
}

/* ------------------------------ Sub-responses ----------------------------- */

async function assertGroup(tx: Tx, quizId: number, groupId: number) {
  const [g] = await tx.select({ id: subResponseGroups.id }).from(subResponseGroups).where(and(eq(subResponseGroups.id, groupId), eq(subResponseGroups.quizId, quizId)));
  if (!g) throw new ContentError("invalid", "Choose a group.", "groupId");
}

const nextPosition = async (tx: Tx, groupId: number) =>
  ((await tx.select({ last: max(subResponses.position) }).from(subResponses).where(eq(subResponses.groupId, groupId)))[0].last ?? -1) + 1;

/** Creates (id null) or updates a sub-response. Moving it to another group puts it last there. */
export async function saveSubResponse(db: Database, quizId: number, input: SubResponseInput): Promise<number> {
  return db.transaction(async (tx) => {
    await lockQuiz(tx, quizId);
    await assertGroup(tx, quizId, input.groupId);
    const values = { groupId: input.groupId, title: input.title, description: input.description, url: input.url };
    let id: number;
    if (input.id === null) {
      const [{ n }] = await tx.select({ n: count() }).from(subResponses).where(eq(subResponses.quizId, quizId));
      if (n >= MAX_SUB_RESPONSES) throw new ContentError("limit", `A quiz can have at most ${MAX_SUB_RESPONSES} sub-responses.`);
      const [row] = await tx.insert(subResponses).values({ quizId, ...values, position: await nextPosition(tx, input.groupId) }).returning({ id: subResponses.id });
      id = row.id;
    } else {
      const [current] = await tx.select().from(subResponses).where(and(eq(subResponses.id, input.id), eq(subResponses.quizId, quizId)));
      if (!current) throw new ContentError("not_found", "That sub-response no longer exists.");
      const moved = current.groupId !== input.groupId;
      await tx
        .update(subResponses)
        .set({ ...values, ...(moved ? { position: await nextPosition(tx, input.groupId) } : {}) })
        .where(eq(subResponses.id, input.id));
      id = input.id;
    }
    await bumpStructureVersion(tx, quizId);
    return id;
  });
}

/** Deletes it and takes it off every response (published versions keep their own copy). */
export async function deleteSubResponse(db: Database, quizId: number, id: number): Promise<void> {
  await db.transaction(async (tx) => {
    await lockQuiz(tx, quizId);
    await tx.delete(subResponses).where(and(eq(subResponses.id, id), eq(subResponses.quizId, quizId)));
    await bumpStructureVersion(tx, quizId);
  });
}

export async function reorderSubResponses(db: Database, quizId: number, groupId: number, ids: number[]): Promise<void> {
  await db.transaction(async (tx) => {
    await lockQuiz(tx, quizId);
    const existing = (
      await tx.select({ id: subResponses.id }).from(subResponses).where(and(eq(subResponses.quizId, quizId), eq(subResponses.groupId, groupId)))
    ).map((r) => r.id);
    await renumber(tx, subResponses, existing, ids, "sub-responses");
    await bumpStructureVersion(tx, quizId);
  });
}

/* ------------------------------ On a response ----------------------------- */

/** The sub-responses a response lists, in its order. */
export async function responseSubResponseIds(db: Executor, resultId: number): Promise<number[]> {
  const rows = await db
    .select({ id: resultSubResponses.subResponseId })
    .from(resultSubResponses)
    .where(eq(resultSubResponses.resultId, resultId))
    .orderBy(asc(resultSubResponses.position));
  return rows.map((r) => r.id);
}

/** Replaces which sub-responses a response lists, and their order. */
export async function setResponseSubResponses(db: Database, quizId: number, resultId: number, ids: number[]): Promise<void> {
  const unique = [...new Set(ids)];
  if (unique.length > MAX_SUB_RESPONSES_PER_RESPONSE) {
    throw new ContentError("limit", `A response can list at most ${MAX_SUB_RESPONSES_PER_RESPONSE} sub-responses.`);
  }
  await db.transaction(async (tx) => {
    await lockQuiz(tx, quizId);
    const [response] = await tx.select({ id: results.id }).from(results).where(and(eq(results.id, resultId), eq(results.quizId, quizId)));
    if (!response) throw new ContentError("not_found", "That response no longer exists.");
    if (unique.length) {
      const found = await tx.select({ id: subResponses.id }).from(subResponses).where(and(eq(subResponses.quizId, quizId), inArray(subResponses.id, unique)));
      if (found.length !== unique.length) throw new ContentError("invalid", "Some sub-responses no longer exist. Reload and try again.");
    }
    await tx.delete(resultSubResponses).where(eq(resultSubResponses.resultId, resultId));
    if (unique.length) await tx.insert(resultSubResponses).values(unique.map((subResponseId, position) => ({ resultId, subResponseId, position })));
    await bumpStructureVersion(tx, quizId);
  });
}
