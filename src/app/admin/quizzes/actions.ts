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
import { eq } from "drizzle-orm";
import { recordAudit } from "@/lib/audit";
import { codeDatesInput, codeInput } from "@/lib/content/quiz-code-rules";
import { createCode, resetReportLink, setCodeArchived, setRequireCode, updateCode } from "@/lib/content/quiz-codes";
import { duplicateQuiz } from "@/lib/content/quiz-file";
import { db } from "@/lib/db/client";
import { quizzes } from "@/lib/db/schema";
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
    await recordAudit(db, staff, { scope: "quiz", action: "quiz.create", quizId: id, summary: "Created the quiz" });
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
  const staff = await requireStaff();
  const id = idSchema.parse(quizId);
  try {
    await updateQuiz(db, id, readQuizForm(formData));
    await recordAudit(db, staff, { scope: "quiz", action: "quiz.update", quizId: id, summary: "Edited the title, slug or introduction" });
  } catch (error) {
    return failure(error);
  }
  expireQuizPages();
  revalidatePath("/admin/quizzes", "layout");
  return { ok: true, message: "Saved." };
}

export async function deleteQuizAction(quizId: number, _prev: FormState): Promise<FormState> {
  const staff = await requireStaff();
  const id = idSchema.parse(quizId);
  try {
    const [before] = await db.select({ title: quizzes.title }).from(quizzes).where(eq(quizzes.id, id)).limit(1);
    await deleteQuiz(db, id);
    await recordAudit(db, staff, { scope: "quiz", action: "quiz.delete", quizTitle: before?.title ?? null, summary: `Deleted the quiz “${before?.title ?? id}”` });
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
  const staff = await requireStaff();
  const id = idSchema.parse(quizId);
  try {
    const input = quizScoringInput.parse({
      runnersUpCount: formData.get("runnersUpCount"),
      normalizePerCategory: formData.get("normalizePerCategory") === "on",
      defaultResultId: formData.get("defaultResultId") || null,
    });
    await updateQuizScoring(db, id, input);
    await recordAudit(db, staff, { scope: "quiz", action: "quiz.scoring", quizId: id, summary: "Changed scoring settings", details: input });
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
  const staff = await requireStaff();
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
    await recordAudit(db, staff, { scope: "quiz", action: "quiz.respondent", quizId: id, summary: "Changed respondent options" });
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
  const staff = await requireStaff();
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
    await recordAudit(db, staff, { scope: "quiz", action: "quiz.delivery", quizId: id, summary: "Changed delivery settings" });
  } catch (error) {
    return failure(error);
  }
  expireQuizPages();
  revalidatePath("/admin/quizzes", "layout");
  return { ok: true, message: "Delivery settings saved." };
}

export async function setQuizStatusAction(quizId: number, status: "draft" | "published"): Promise<FormState> {
  const staff = await requireStaff();
  const id = idSchema.parse(quizId);
  if (status !== "draft" && status !== "published") return { error: "Unknown status." };
  try {
    await setQuizStatus(db, id, status);
    await recordAudit(db, staff, { scope: "quiz", action: status === "published" ? "quiz.publish" : "quiz.unpublish", quizId: id, summary: status === "published" ? "Published the quiz" : "Unpublished the quiz" });
  } catch (error) {
    return failure(error);
  }
  expireQuizPages();
  revalidatePath("/admin/quizzes", "layout");
  return { ok: true, message: status === "published" ? "Published." : "Unpublished." };
}

export async function updateBannerAction(quizId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaff();
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
    await recordAudit(db, staff, { scope: "quiz", action: removing ? "quiz.banner_remove" : "quiz.banner", quizId: id, summary: removing ? "Removed the banner" : "Changed the banner" });
  } catch (error) {
    return failure(error);
  }
  expireQuizPages();
  revalidatePath("/admin/quizzes", "layout");
  return { ok: true, message: removing ? "Banner removed." : "Banner saved." };
}

export async function updateQuizCssAction(quizId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const id = idSchema.parse(quizId);
  try {
    const { css } = z.object({ css: customCssInput }).parse({ css: String(formData.get("css") ?? "") });
    await updateQuizCss(db, id, css);
    await recordAudit(db, staff, { scope: "quiz", action: "quiz.css", quizId: id, summary: "Changed the quiz CSS", details: { characters: css.length } });
  } catch (error) {
    return failure(error);
  }
  expireQuizPages();
  revalidatePath("/admin/quizzes", "layout");
  return { ok: true, message: "Quiz CSS saved." };
}

export async function duplicateQuizAction(quizId: number): Promise<FormState> {
  const staff = await requireStaff();
  const id = idSchema.parse(quizId);
  let newId: number;
  try {
    newId = await duplicateQuiz(db, id, staff.email);
    const [source] = await db.select({ title: quizzes.title }).from(quizzes).where(eq(quizzes.id, id)).limit(1);
    await recordAudit(db, staff, { scope: "quiz", action: "quiz.duplicate", quizId: newId, summary: `Created as a copy of “${source?.title ?? id}”`, details: { sourceQuizId: id } });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/admin/quizzes");
  redirect(`/admin/quizzes/${newId}`);
}

/* ------------------------------- Quiz codes ------------------------------ */

export async function setRequireCodeAction(quizId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const id = idSchema.parse(quizId);
  const required = formData.get("requireCode") === "on";
  await setRequireCode(db, id, required);
  await recordAudit(db, staff, {
    scope: "quiz",
    action: "quiz.require_code",
    quizId: id,
    summary: required ? "Required a quiz code to start" : "Stopped requiring a quiz code",
  });
  expireQuizPages();
  revalidatePath("/admin/quizzes", "layout");
  return { ok: true, message: required ? "A code is now required to start." : "Anyone can start without a code." };
}

export async function createCodeAction(quizId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const id = idSchema.parse(quizId);
  try {
    const input = codeInput.parse({
      code: String(formData.get("code") ?? ""),
      label: String(formData.get("label") ?? ""),
      opensOn: String(formData.get("opensOn") ?? ""),
      closesOn: String(formData.get("closesOn") ?? ""),
    });
    await createCode(db, id, input, staff.email);
    await recordAudit(db, staff, { scope: "quiz", action: "code.create", quizId: id, summary: `Created quiz code ${input.code}${input.label ? ` (${input.label})` : ""}` });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/admin/quizzes", "layout");
  return { ok: true, message: "Code created." };
}

export async function updateCodeAction(quizId: number, codeId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const id = idSchema.parse(quizId);
  try {
    const input = codeDatesInput.parse({
      label: String(formData.get("label") ?? ""),
      opensOn: String(formData.get("opensOn") ?? ""),
      closesOn: String(formData.get("closesOn") ?? ""),
    });
    const code = await updateCode(db, id, idSchema.parse(codeId), input);
    await recordAudit(db, staff, { scope: "quiz", action: "code.update", quizId: id, summary: `Changed quiz code ${code}'s label or dates` });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/admin/quizzes", "layout");
  return { ok: true, message: "Saved." };
}

export async function archiveCodeAction(quizId: number, codeId: number, archived: boolean): Promise<FormState> {
  const staff = await requireStaff();
  const id = idSchema.parse(quizId);
  try {
    const code = await setCodeArchived(db, id, idSchema.parse(codeId), archived);
    await recordAudit(db, staff, { scope: "quiz", action: archived ? "code.archive" : "code.restore", quizId: id, summary: `${archived ? "Archived" : "Restored"} quiz code ${code}` });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/admin/quizzes", "layout");
  return { ok: true };
}

export async function resetReportLinkAction(quizId: number, codeId: number): Promise<FormState> {
  const staff = await requireStaff();
  const id = idSchema.parse(quizId);
  try {
    const code = await resetReportLink(db, id, idSchema.parse(codeId));
    await recordAudit(db, staff, { scope: "quiz", action: "code.report_reset", quizId: id, summary: `Made a new teacher link for quiz code ${code} (the old one stopped working)` });
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/admin/quizzes", "layout");
  return { ok: true, message: "New teacher link made. The old link no longer works." };
}
