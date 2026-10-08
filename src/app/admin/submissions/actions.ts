"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { deleteSubmissions, revokeShareLink } from "@/lib/admin/submissions";
import { requireSuperAdmin } from "@/lib/auth/access";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db/client";

const ids = z.array(z.number().int().positive()).min(1).max(500);
const id = z.number().int().positive();

export type BulkResult = { ok: boolean; message: string };

export async function deleteSubmissionsAction(selected: number[]): Promise<BulkResult> {
  const staff = await requireSuperAdmin();
  const parsed = ids.safeParse(selected);
  if (!parsed.success) return { ok: false, message: "Choose between 1 and 500 submissions." };
  const n = await deleteSubmissions(db, parsed.data);
  await recordAudit(db, staff, { scope: "submissions", action: "submission.delete", summary: `Deleted ${n} submission${n === 1 ? "" : "s"}`, details: { ids: parsed.data } });
  revalidatePath("/admin/submissions");
  return { ok: true, message: `Deleted ${n} submission${n === 1 ? "" : "s"}.` };
}

/** From the detail page: delete, then back to the list (with its filters). */
export async function deleteSubmissionAndReturn(submissionId: number, back: string): Promise<void> {
  const staff = await requireSuperAdmin();
  const sid = id.parse(submissionId);
  await deleteSubmissions(db, [sid]);
  await recordAudit(db, staff, { scope: "submissions", action: "submission.delete", summary: `Deleted submission #${sid}`, details: { ids: [sid] } });
  revalidatePath("/admin/submissions");
  redirect(listHref(back));
}

export async function revokeShareLinkAction(submissionId: number): Promise<void> {
  const staff = await requireSuperAdmin();
  const parsed = id.parse(submissionId);
  await revokeShareLink(db, parsed);
  await recordAudit(db, staff, { scope: "submissions", action: "submission.revoke_share", summary: `Turned off the share link for submission #${parsed}` });
  revalidatePath(`/admin/submissions/${parsed}`);
}

/** Only ever a query string on the list page (no open redirects). */
function listHref(back: string): string {
  return back.startsWith("?") && !back.includes("//") ? `/admin/submissions${back}` : "/admin/submissions";
}
