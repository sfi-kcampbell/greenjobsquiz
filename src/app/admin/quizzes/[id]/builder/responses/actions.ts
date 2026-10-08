"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/access";
import { failure, idSchema, type ActionResult } from "@/lib/content/action-result";
import {
  deleteResponse,
  getResponse,
  listResponses,
  reorderResponses,
  saveResponseRow,
  updateResponseDetails,
  type ResponseView,
} from "@/lib/content/responses";
import { fieldErrors, responseDetailsInput, responseRowInput } from "@/lib/content/validation";
import { eq } from "drizzle-orm";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db/client";
import { results } from "@/lib/db/schema";

type ListResult = ActionResult<{ responses: ResponseView[]; savedId?: number }>;

async function done(quizId: number, savedId?: number): Promise<ListResult> {
  revalidatePath(`/admin/quizzes/${quizId}/builder`, "layout");
  return { ok: true, data: { responses: await listResponses(db, quizId), savedId } };
}

export async function saveResponseRowAction(quizId: number, input: unknown): Promise<ListResult> {
  const staff = await requireStaff();
  try {
    const qid = idSchema.parse(quizId);
    const row = responseRowInput.parse(input);
    const savedId = await saveResponseRow(db, qid, row);
    await recordAudit(db, staff, {
      scope: "quiz",
      action: row.id === null ? "response.create" : "response.update",
      quizId: qid,
      summary: row.id === null ? `Added response “${row.title}”` : `Edited response “${row.title}” (weights)`,
    });
    return done(qid, savedId);
  } catch (error) {
    return failure(error);
  }
}

export async function deleteResponseAction(quizId: number, id: number): Promise<ListResult> {
  const staff = await requireStaff();
  try {
    const qid = idSchema.parse(quizId);
    const rid = idSchema.parse(id);
    const [r] = await db.select({ title: results.title }).from(results).where(eq(results.id, rid)).limit(1);
    await deleteResponse(db, qid, rid);
    await recordAudit(db, staff, { scope: "quiz", action: "response.delete", quizId: qid, summary: `Deleted response “${r?.title ?? rid}”` });
    return done(qid);
  } catch (error) {
    return failure(error);
  }
}

export async function reorderResponsesAction(quizId: number, orderedIds: number[]): Promise<ListResult> {
  const staff = await requireStaff();
  try {
    const qid = idSchema.parse(quizId);
    await reorderResponses(db, qid, z.array(idSchema).max(500).parse(orderedIds));
    await recordAudit(db, staff, { scope: "quiz", action: "response.reorder", quizId: qid, summary: "Reordered responses" });
    return done(qid);
  } catch (error) {
    return failure(error);
  }
}

export async function updateResponseDetailsAction(
  quizId: number,
  id: number,
  input: unknown,
): Promise<ActionResult<{ response: ResponseView }>> {
  const staff = await requireStaff();
  try {
    const qid = idSchema.parse(quizId);
    const rid = idSchema.parse(id);
    const parsed = responseDetailsInput.safeParse(input);
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
    await updateResponseDetails(db, qid, rid, parsed.data);
    await recordAudit(db, staff, { scope: "quiz", action: "response.update", quizId: qid, summary: `Edited response “${parsed.data.title}”` });
    revalidatePath(`/admin/quizzes/${qid}/builder`, "layout");
    return { ok: true, data: { response: (await getResponse(db, qid, rid))! } };
  } catch (error) {
    return failure(error);
  }
}
