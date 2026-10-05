"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth/access";
import { failure, idSchema, type ActionResult } from "@/lib/content/action-result";
import {
  createCategory,
  deleteCategory,
  listCategories,
  reorderCategories,
  seedSuggestedCategories,
  updateCategory,
  type CategoryView,
} from "@/lib/content/categories";
import { categoryInput } from "@/lib/content/validation";
import { db } from "@/lib/db/client";

/**
 * Category server actions. Each one: check access → validate → write through
 * the content layer → return the fresh list, which the editor merges into its
 * local state without losing unsaved edits in other rows.
 */

type ListResult = ActionResult<{ categories: CategoryView[]; savedId?: number }>;

async function done(quizId: number, savedId?: number): Promise<ListResult> {
  revalidatePath(`/admin/quizzes/${quizId}/builder`, "layout");
  revalidatePath("/admin/quizzes");
  return { ok: true, data: { categories: await listCategories(db, quizId), savedId } };
}

const saveInput = categoryInput.extend({ id: idSchema.nullable() });

export async function saveCategoryAction(quizId: number, input: unknown): Promise<ListResult> {
  await requireStaff();
  try {
    const qid = idSchema.parse(quizId);
    const { id, ...fields } = saveInput.parse(input);
    if (id === null) {
      return done(qid, await createCategory(db, qid, fields));
    }
    await updateCategory(db, qid, id, fields);
    return done(qid, id);
  } catch (error) {
    return failure(error);
  }
}

export async function deleteCategoryAction(quizId: number, id: number): Promise<ListResult> {
  await requireStaff();
  try {
    const qid = idSchema.parse(quizId);
    await deleteCategory(db, qid, idSchema.parse(id));
    return done(qid);
  } catch (error) {
    return failure(error);
  }
}

export async function reorderCategoriesAction(quizId: number, orderedIds: number[]): Promise<ListResult> {
  await requireStaff();
  try {
    const qid = idSchema.parse(quizId);
    await reorderCategories(db, qid, z.array(idSchema).max(100).parse(orderedIds));
    return done(qid);
  } catch (error) {
    return failure(error);
  }
}

export async function seedCategoriesAction(quizId: number): Promise<ListResult> {
  await requireStaff();
  try {
    const qid = idSchema.parse(quizId);
    await seedSuggestedCategories(db, qid);
    return done(qid);
  } catch (error) {
    return failure(error);
  }
}
