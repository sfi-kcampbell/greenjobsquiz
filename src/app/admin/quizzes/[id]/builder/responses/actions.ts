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
import { db } from "@/lib/db/client";

type ListResult = ActionResult<{ responses: ResponseView[]; savedId?: number }>;

async function done(quizId: number, savedId?: number): Promise<ListResult> {
  revalidatePath(`/admin/quizzes/${quizId}/builder`, "layout");
  return { ok: true, data: { responses: await listResponses(db, quizId), savedId } };
}

export async function saveResponseRowAction(quizId: number, input: unknown): Promise<ListResult> {
  await requireStaff();
  try {
    const qid = idSchema.parse(quizId);
    return done(qid, await saveResponseRow(db, qid, responseRowInput.parse(input)));
  } catch (error) {
    return failure(error);
  }
}

export async function deleteResponseAction(quizId: number, id: number): Promise<ListResult> {
  await requireStaff();
  try {
    const qid = idSchema.parse(quizId);
    await deleteResponse(db, qid, idSchema.parse(id));
    return done(qid);
  } catch (error) {
    return failure(error);
  }
}

export async function reorderResponsesAction(quizId: number, orderedIds: number[]): Promise<ListResult> {
  await requireStaff();
  try {
    const qid = idSchema.parse(quizId);
    await reorderResponses(db, qid, z.array(idSchema).max(500).parse(orderedIds));
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
  await requireStaff();
  try {
    const qid = idSchema.parse(quizId);
    const rid = idSchema.parse(id);
    const parsed = responseDetailsInput.safeParse(input);
    if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
    await updateResponseDetails(db, qid, rid, parsed.data);
    revalidatePath(`/admin/quizzes/${qid}/builder`, "layout");
    return { ok: true, data: { response: (await getResponse(db, qid, rid))! } };
  } catch (error) {
    return failure(error);
  }
}
