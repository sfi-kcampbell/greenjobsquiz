"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { requireStaff } from "@/lib/auth/access";
import { failure, idSchema, type ActionResult } from "@/lib/content/action-result";
import {
  deleteGroup,
  deleteSubResponse,
  listGroups,
  listSubResponses,
  reorderGroups,
  reorderSubResponses,
  saveGroup,
  saveSubResponse,
  setResponseSubResponses,
  type SubResponseGroupView,
  type SubResponseView,
} from "@/lib/content/sub-responses";
import { subResponseGroupInput, subResponseInput } from "@/lib/content/validation";
import { db } from "@/lib/db/client";

export type SubResponsesData = { groups: SubResponseGroupView[]; items: SubResponseView[]; savedId?: number };
type Result = ActionResult<SubResponsesData>;

async function done(quizId: number, savedId?: number): Promise<Result> {
  revalidatePath(`/admin/quizzes/${quizId}`, "layout");
  return { ok: true, data: { groups: await listGroups(db, quizId), items: await listSubResponses(db, quizId), savedId } };
}

const ids = z.array(idSchema).max(1000);

export async function saveGroupAction(quizId: number, input: unknown): Promise<Result> {
  const staff = await requireStaff();
  try {
    const qid = idSchema.parse(quizId);
    const g = subResponseGroupInput.parse(input);
    const id = await saveGroup(db, qid, g);
    await recordAudit(db, staff, { scope: "quiz", action: g.id === null ? "group.create" : "group.update", quizId: qid, summary: `${g.id === null ? "Added" : "Renamed"} sub-response group “${g.name}”` });
    return done(qid, id);
  } catch (error) {
    return failure(error);
  }
}

export async function deleteGroupAction(quizId: number, groupId: number, name: string): Promise<Result> {
  const staff = await requireStaff();
  try {
    const qid = idSchema.parse(quizId);
    await deleteGroup(db, qid, idSchema.parse(groupId));
    await recordAudit(db, staff, { scope: "quiz", action: "group.delete", quizId: qid, summary: `Deleted sub-response group “${name.slice(0, 60)}”` });
    return done(qid);
  } catch (error) {
    return failure(error);
  }
}

export async function reorderGroupsAction(quizId: number, order: unknown): Promise<Result> {
  await requireStaff();
  try {
    const qid = idSchema.parse(quizId);
    await reorderGroups(db, qid, ids.parse(order));
    return done(qid);
  } catch (error) {
    return failure(error);
  }
}

export async function saveSubResponseAction(quizId: number, input: unknown): Promise<Result> {
  const staff = await requireStaff();
  try {
    const qid = idSchema.parse(quizId);
    const x = subResponseInput.parse(input);
    const id = await saveSubResponse(db, qid, x);
    await recordAudit(db, staff, { scope: "quiz", action: x.id === null ? "subresponse.create" : "subresponse.update", quizId: qid, summary: `${x.id === null ? "Added" : "Edited"} sub-response “${x.title}”` });
    return done(qid, id);
  } catch (error) {
    return failure(error);
  }
}

export async function deleteSubResponseAction(quizId: number, id: number, title: string): Promise<Result> {
  const staff = await requireStaff();
  try {
    const qid = idSchema.parse(quizId);
    await deleteSubResponse(db, qid, idSchema.parse(id));
    await recordAudit(db, staff, { scope: "quiz", action: "subresponse.delete", quizId: qid, summary: `Deleted sub-response “${title.slice(0, 120)}”` });
    return done(qid);
  } catch (error) {
    return failure(error);
  }
}

export async function reorderSubResponsesAction(quizId: number, groupId: number, order: unknown): Promise<Result> {
  await requireStaff();
  try {
    const qid = idSchema.parse(quizId);
    await reorderSubResponses(db, qid, idSchema.parse(groupId), ids.parse(order));
    return done(qid);
  } catch (error) {
    return failure(error);
  }
}

/** Which sub-responses a response lists, in order (from the response page). */
export async function setResponseSubResponsesAction(quizId: number, responseId: number, list: unknown, title: string): Promise<ActionResult<{ ids: number[] }>> {
  const staff = await requireStaff();
  try {
    const qid = idSchema.parse(quizId);
    const order = ids.parse(list);
    await setResponseSubResponses(db, qid, idSchema.parse(responseId), order);
    await recordAudit(db, staff, { scope: "quiz", action: "response.subresponses", quizId: qid, summary: `Set ${order.length} sub-response${order.length === 1 ? "" : "s"} for response “${title.slice(0, 120)}”` });
    revalidatePath(`/admin/quizzes/${qid}`, "layout");
    return { ok: true, data: { ids: order } };
  } catch (error) {
    return failure(error);
  }
}
