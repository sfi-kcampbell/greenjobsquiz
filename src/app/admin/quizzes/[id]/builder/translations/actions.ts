"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { requireStaff } from "@/lib/auth/access";
import { failure, idSchema, type ActionResult } from "@/lib/content/action-result";
import { saveTranslations, translationEditor, type EditorField } from "@/lib/content/translations";
import { readWorkingContent } from "@/lib/content/versions";
import { db } from "@/lib/db/client";
import { isLocale, LOCALE_NAMES_EN } from "@/lib/i18n/locales";

const entriesInput = z.array(z.object({ key: z.string().max(80), text: z.string().max(60_000) })).max(500);

/** Saves some fields' translations; returns every field again (stale flags updated). */
export async function saveTranslationsAction(
  quizId: number,
  locale: string,
  entries: unknown,
  group: string,
): Promise<ActionResult<{ fields: EditorField[]; message: string }>> {
  const staff = await requireStaff();
  try {
    const qid = idSchema.parse(quizId);
    if (!isLocale(locale)) throw new z.ZodError([]);
    const list = entriesInput.parse(entries);
    const content = await readWorkingContent(db, qid);
    const { saved, cleared } = await saveTranslations(db, qid, locale, list, content);
    const name = LOCALE_NAMES_EN[locale];
    await recordAudit(db, staff, {
      scope: "quiz",
      action: "translation.save",
      quizId: qid,
      summary: `Saved ${name} translations for ${group.slice(0, 120)} (${saved} saved${cleared ? `, ${cleared} cleared` : ""})`,
    });
    revalidatePath(`/admin/quizzes/${qid}`, "layout");
    return {
      ok: true,
      data: { fields: await translationEditor(db, qid, locale, content), message: `Saved. Publish changes to make them live.` },
    };
  } catch (error) {
    return failure(error);
  }
}
