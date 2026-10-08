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
import { eq } from "drizzle-orm";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db/client";
import { questions } from "@/lib/db/schema";

type ListResult = ActionResult<{ questions: QuestionView[]; saved?: SaveQuestionResult }>;

async function done(quizId: number, saved?: SaveQuestionResult): Promise<ListResult> {
  revalidatePath(`/admin/quizzes/${quizId}/builder`, "layout");
  return { ok: true, data: { questions: await listQuestions(db, quizId), saved } };
}

export async function saveQuestionAction(quizId: number, input: unknown): Promise<ListResult> {
  const staff = await requireStaff();
  try {
    const qid = idSchema.parse(quizId);
    const parsed = questionInput.safeParse(input);
    // Nested paths ("answers.2.label") so the card can point at the exact cell.
    if (!parsed.success) return { ok: false, fieldErrors: pathErrors(parsed.error) };
    const saved = await saveQuestion(db, qid, parsed.data);
    await recordAudit(db, staff, {
      scope: "quiz",
      action: parsed.data.id === null ? "question.create" : "question.update",
      quizId: qid,
      summary: `${parsed.data.id === null ? "Added" : "Edited"} question “${parsed.data.title}”`,
      details: { questionId: saved.questionId, answers: parsed.data.answers.length },
    });
    return done(qid, saved);
  } catch (error) {
    return failure(error);
  }
}

export async function deleteQuestionAction(quizId: number, id: number): Promise<ListResult> {
  const staff = await requireStaff();
  try {
    const qid = idSchema.parse(quizId);
    const questionId = idSchema.parse(id);
    const [q] = await db.select({ title: questions.title }).from(questions).where(eq(questions.id, questionId)).limit(1);
    await deleteQuestion(db, qid, questionId);
    await recordAudit(db, staff, { scope: "quiz", action: "question.delete", quizId: qid, summary: `Deleted question “${q?.title ?? questionId}”` });
    return done(qid);
  } catch (error) {
    return failure(error);
  }
}

export async function reorderQuestionsAction(quizId: number, orderedIds: number[]): Promise<ListResult> {
  const staff = await requireStaff();
  try {
    const qid = idSchema.parse(quizId);
    await reorderQuestions(db, qid, z.array(idSchema).max(500).parse(orderedIds));
    await recordAudit(db, staff, { scope: "quiz", action: "question.reorder", quizId: qid, summary: "Reordered questions" });
    return done(qid);
  } catch (error) {
    return failure(error);
  }
}
