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
import { eq } from "drizzle-orm";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db/client";
import { categories } from "@/lib/db/schema";

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
  const staff = await requireStaff();
  try {
    const qid = idSchema.parse(quizId);
    const { id, ...fields } = saveInput.parse(input);
    if (id === null) {
      const newId = await createCategory(db, qid, fields);
      await recordAudit(db, staff, { scope: "quiz", action: "category.create", quizId: qid, summary: `Added category “${fields.name}”` });
      return done(qid, newId);
    }
    await updateCategory(db, qid, id, fields);
    await recordAudit(db, staff, { scope: "quiz", action: "category.update", quizId: qid, summary: `Edited category “${fields.name}”` });
    return done(qid, id);
  } catch (error) {
    return failure(error);
  }
}

export async function deleteCategoryAction(quizId: number, id: number): Promise<ListResult> {
  const staff = await requireStaff();
  try {
    const qid = idSchema.parse(quizId);
    const cid = idSchema.parse(id);
    const [cat] = await db.select({ name: categories.name }).from(categories).where(eq(categories.id, cid)).limit(1);
    await deleteCategory(db, qid, cid);
    await recordAudit(db, staff, { scope: "quiz", action: "category.delete", quizId: qid, summary: `Deleted category “${cat?.name ?? cid}”` });
    return done(qid);
  } catch (error) {
    return failure(error);
  }
}

export async function reorderCategoriesAction(quizId: number, orderedIds: number[]): Promise<ListResult> {
  const staff = await requireStaff();
  try {
    const qid = idSchema.parse(quizId);
    await reorderCategories(db, qid, z.array(idSchema).max(100).parse(orderedIds));
    await recordAudit(db, staff, { scope: "quiz", action: "category.reorder", quizId: qid, summary: "Reordered categories" });
    return done(qid);
  } catch (error) {
    return failure(error);
  }
}

export async function seedCategoriesAction(quizId: number): Promise<ListResult> {
  const staff = await requireStaff();
  try {
    const qid = idSchema.parse(quizId);
    await seedSuggestedCategories(db, qid);
    await recordAudit(db, staff, { scope: "quiz", action: "category.seed", quizId: qid, summary: "Added the suggested categories" });
    return done(qid);
  } catch (error) {
    return failure(error);
  }
}
