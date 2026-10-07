"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/access";
import { failure, idSchema, type FormState } from "@/lib/content/action-result";
import {
  createQuiz,
  deleteQuiz,
  setQuizStatus,
  updateQuiz,
  updateQuizBanner,
  updateQuizCss,
  updateQuizDelivery,
  updateQuizRespondentOptions,
  updateQuizScoring,
} from "@/lib/content/quizzes";
import {
  customCssInput,
  quizBannerInput,
  quizDeliveryInput,
  quizInput,
  quizRespondentInput,
  quizScoringInput,
} from "@/lib/content/validation";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { expireQuizPages } from "@/lib/public/page-cache";

function readQuizForm(formData: FormData) {
  return quizInput.parse({
    title: String(formData.get("title") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    introHtml: formData.has("introHtml") ? String(formData.get("introHtml")) : undefined,
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
  expireQuizPages();
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
  expireQuizPages();
  revalidatePath("/admin/quizzes");
  redirect("/admin/quizzes");
}

export async function updateScoringAction(
  quizId: number,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireStaff();
  const id = idSchema.parse(quizId);
  try {
    const input = quizScoringInput.parse({
      runnersUpCount: formData.get("runnersUpCount"),
      normalizePerCategory: formData.get("normalizePerCategory") === "on",
      defaultResultId: formData.get("defaultResultId") || null,
    });
    await updateQuizScoring(db, id, input);
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/admin/quizzes", "layout");
  return { ok: true, message: "Scoring settings saved." };
}

export async function updateRespondentOptionsAction(
  quizId: number,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireStaff();
  const id = idSchema.parse(quizId);
  try {
    await updateQuizRespondentOptions(
      db,
      id,
      quizRespondentInput.parse({
        showProgress: formData.get("showProgress") === "on",
        autoAdvance: formData.get("autoAdvance") === "on",
        retakeAllowed: formData.get("retakeAllowed") === "on",
      }),
    );
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/admin/quizzes", "layout");
  return { ok: true, message: "Respondent options saved." };
}

export async function updateDeliveryAction(
  quizId: number,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireStaff();
  const id = idSchema.parse(quizId);
  try {
    await updateQuizDelivery(
      db,
      id,
      quizDeliveryInput.parse({
        layout: formData.get("layout"),
        layoutTemplate: formData.get("layoutTemplate"),
        deliveryMode: formData.get("deliveryMode"),
        headlessBaseUrl: String(formData.get("headlessBaseUrl") ?? ""),
      }),
    );
  } catch (error) {
    return failure(error);
  }
  expireQuizPages();
  revalidatePath("/admin/quizzes", "layout");
  return { ok: true, message: "Delivery settings saved." };
}

export async function setQuizStatusAction(quizId: number, status: "draft" | "published"): Promise<FormState> {
  await requireStaff();
  const id = idSchema.parse(quizId);
  if (status !== "draft" && status !== "published") return { error: "Unknown status." };
  try {
    await setQuizStatus(db, id, status);
  } catch (error) {
    return failure(error);
  }
  expireQuizPages();
  revalidatePath("/admin/quizzes", "layout");
  return { ok: true, message: status === "published" ? "Published." : "Unpublished." };
}

export async function updateBannerAction(quizId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireStaff();
  const id = idSchema.parse(quizId);
  const removing = formData.get("intent") === "remove";
  try {
    await updateQuizBanner(
      db,
      id,
      quizBannerInput.parse({
        mediaId: removing ? "" : String(formData.get("mediaId") ?? ""),
        alt: formData.get("decorative") ? "" : String(formData.get("alt") ?? ""),
      }),
    );
  } catch (error) {
    return failure(error);
  }
  expireQuizPages();
  revalidatePath("/admin/quizzes", "layout");
  return { ok: true, message: removing ? "Banner removed." : "Banner saved." };
}

export async function updateQuizCssAction(quizId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireStaff();
  const id = idSchema.parse(quizId);
  try {
    const { css } = z.object({ css: customCssInput }).parse({ css: String(formData.get("css") ?? "") });
    await updateQuizCss(db, id, css);
  } catch (error) {
    return failure(error);
  }
  expireQuizPages();
  revalidatePath("/admin/quizzes", "layout");
  return { ok: true, message: "Quiz CSS saved." };
}
