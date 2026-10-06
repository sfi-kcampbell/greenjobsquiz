"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { deleteSubmissions, revokeShareLink } from "@/lib/admin/submissions";
import { requireSuperAdmin } from "@/lib/auth/access";
import { db } from "@/lib/db/client";

const ids = z.array(z.number().int().positive()).min(1).max(500);
const id = z.number().int().positive();

export type BulkResult = { ok: boolean; message: string };

export async function deleteSubmissionsAction(selected: number[]): Promise<BulkResult> {
  await requireSuperAdmin();
  const parsed = ids.safeParse(selected);
  if (!parsed.success) return { ok: false, message: "Choose between 1 and 500 submissions." };
  const n = await deleteSubmissions(db, parsed.data);
  revalidatePath("/admin/submissions");
  return { ok: true, message: `Deleted ${n} submission${n === 1 ? "" : "s"}.` };
}

/** From the detail page: delete, then back to the list (with its filters). */
export async function deleteSubmissionAndReturn(submissionId: number, back: string): Promise<void> {
  await requireSuperAdmin();
  await deleteSubmissions(db, [id.parse(submissionId)]);
  revalidatePath("/admin/submissions");
  redirect(listHref(back));
}

export async function revokeShareLinkAction(submissionId: number): Promise<void> {
  await requireSuperAdmin();
  const parsed = id.parse(submissionId);
  await revokeShareLink(db, parsed);
  revalidatePath(`/admin/submissions/${parsed}`);
}

/** Only ever a query string on the list page (no open redirects). */
function listHref(back: string): string {
  return back.startsWith("?") && !back.includes("//") ? `/admin/submissions${back}` : "/admin/submissions";
}
