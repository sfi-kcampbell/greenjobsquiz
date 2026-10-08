"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/access";
import { failure, type FormState } from "@/lib/content/action-result";
import { updateAccessSettings, updateSiteCss } from "@/lib/content/settings";
import { accessSettingsInput, customCssInput } from "@/lib/content/validation";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { expireQuizPages } from "@/lib/public/page-cache";

export async function updateAccessSettingsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSuperAdmin();
  try {
    await updateAccessSettings(
      db,
      accessSettingsInput.parse({
        embedOrigins: String(formData.get("embedOrigins") ?? ""),
        corsOrigins: String(formData.get("corsOrigins") ?? ""),
      }),
    );
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/admin/settings");
  return { ok: true, message: "Saved. Changes reach embeds within a minute." };
}

export async function updateSiteCssAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSuperAdmin();
  try {
    const { css } = z.object({ css: customCssInput }).parse({ css: String(formData.get("css") ?? "") });
    await updateSiteCss(db, css);
  } catch (error) {
    return failure(error);
  }
  expireQuizPages();
  revalidatePath("/admin/settings");
  return { ok: true, message: "Site CSS saved." };
}
