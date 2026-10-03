"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/access";
import { failure, idSchema, type ActionResult } from "@/lib/content/action-result";
import {
  deleteQuestion,
  listQuestions,
  reorderQuestions,
  saveQuestion,
  type QuestionView,
  type SaveQuestionResult,
} from "@/lib/content/questions";
import { pathErrors, questionInput } from "@/lib/content/validation";
import { db } from "@/lib/db/client";

type ListResult = ActionResult<{ questions: QuestionView[]; saved?: SaveQuestionResult }>;

async function done(quizId: number, saved?: SaveQuestionResult): Promise<ListResult> {
  revalidatePath(`/admin/quizzes/${quizId}/builder`, "layout");
  return { ok: true, data: { questions: await listQuestions(db, quizId), saved } };
}

export async function saveQuestionAction(quizId: number, input: unknown): Promise<ListResult> {
  await requireStaff();
  try {
    const qid = idSchema.parse(quizId);
    const parsed = questionInput.safeParse(input);
    // Nested paths ("answers.2.label") so the card can point at the exact cell.
    if (!parsed.success) return { ok: false, fieldErrors: pathErrors(parsed.error) };
    return done(qid, await saveQuestion(db, qid, parsed.data));
  } catch (error) {
    return failure(error);
  }
}

export async function deleteQuestionAction(quizId: number, id: number): Promise<ListResult> {
  await requireStaff();
  try {
    const qid = idSchema.parse(quizId);
    await deleteQuestion(db, qid, idSchema.parse(id));
    return done(qid);
  } catch (error) {
    return failure(error);
  }
}

export async function reorderQuestionsAction(quizId: number, orderedIds: number[]): Promise<ListResult> {
  await requireStaff();
  try {
    const qid = idSchema.parse(quizId);
    await reorderQuestions(db, qid, z.array(idSchema).max(500).parse(orderedIds));
    return done(qid);
  } catch (error) {
    return failure(error);
  }
}
