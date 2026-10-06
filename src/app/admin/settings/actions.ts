"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/access";
import { failure, type FormState } from "@/lib/content/action-result";
import { updateAccessSettings } from "@/lib/content/settings";
import { accessSettingsInput } from "@/lib/content/validation";
import { db } from "@/lib/db/client";

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
