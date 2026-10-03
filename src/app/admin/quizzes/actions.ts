"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/access";
import { failure, idSchema, type FormState } from "@/lib/content/action-result";
import { createQuiz, deleteQuiz, updateQuiz } from "@/lib/content/quizzes";
import { quizInput } from "@/lib/content/validation";
import { db } from "@/lib/db/client";

function readQuizForm(formData: FormData) {
  return quizInput.parse({
    title: String(formData.get("title") ?? ""),
    slug: String(formData.get("slug") ?? ""),
  });
}

export async function createQuizAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaff();
  let id: number;
  try {
    id = await createQuiz(db, readQuizForm(formData), staff.email);
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/admin/quizzes");
  redirect(`/admin/quizzes/${id}/builder/categories`);
}

export async function updateQuizAction(
  quizId: number,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireStaff();
  const id = idSchema.parse(quizId);
  try {
    await updateQuiz(db, id, readQuizForm(formData));
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/admin/quizzes", "layout");
  return { ok: true, message: "Saved." };
}

export async function deleteQuizAction(quizId: number, _prev: FormState): Promise<FormState> {
  await requireStaff();
  const id = idSchema.parse(quizId);
  try {
    await deleteQuiz(db, id);
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/admin/quizzes");
  redirect("/admin/quizzes");
}
