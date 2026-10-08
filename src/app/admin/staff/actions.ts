"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/auth/access";
import { revokeAllStaffPins, revokeStaffPin, setStaffPin } from "@/lib/auth/staff-pins-store";
import { isSuperAdminEmail, normalizeEmail } from "@/lib/auth/super-admins";
import { appUrl } from "@/lib/app-url";
import { db } from "@/lib/db/client";
import { sessions, staffUsers, users } from "@/lib/db/schema";
import { buttonEmail, sendEmail } from "@/lib/mail";

export type InviteState = { ok?: boolean; message?: string; error?: string };

const inviteSchema = z.object({
  email: z.email().transform(normalizeEmail),
  name: z
    .string()
    .trim()
    .max(120)
    .transform((v) => v || null),
});

export async function inviteAdmin(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const me = await requireSuperAdmin();

  const parsed = inviteSchema.safeParse({
    email: String(formData.get("email") ?? "").trim(),
    name: String(formData.get("name") ?? ""),
  });
  if (!parsed.success) return { error: "Enter a valid email address." };
  const { email, name } = parsed.data;

  if (isSuperAdminEmail(email)) {
    return { error: `${email} is already a Super Admin (set by SUPER_ADMINS).` };
  }

  const inserted = await db
    .insert(staffUsers)
    .values({ email, name, role: "admin", invitedBy: me.email })
    .onConflictDoNothing({ target: staffUsers.email })
    .returning({ id: staffUsers.id });

  if (inserted.length === 0) {
    return { error: `${email} is already on the staff list.` };
  }

  revalidatePath("/admin/staff");

  try {
    const url = `${await appUrl()}/sign-in?email=${encodeURIComponent(email)}`;
    const { html, text } = buttonEmail({
      heading: "You've been invited to PLT Quiz",
      body: `${me.email} invited you to help build quizzes. Sign in with this email address to get started.`,
      url,
      button: "Sign in",
    });
    await sendEmail({ to: email, subject: "You've been invited to PLT Quiz", html, text });
  } catch (err) {
    console.error("[staff] Invite email failed:", err);
    return {
      ok: true,
      message: `Added ${email}, but the invite email couldn't be sent. They can still sign in at /sign-in.`,
    };
  }

  return { ok: true, message: `Invited ${email}.` };
}

const idSchema = z.coerce.number().int().positive();

/** Signs the person out everywhere by deleting their Auth.js sessions. */
async function endSessionsFor(email: string) {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (user) await db.delete(sessions).where(eq(sessions.userId, user.id));
}

export async function setAdminDisabled(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const id = idSchema.parse(formData.get("id"));
  const disable = formData.get("disable") === "true";

  const [row] = await db
    .update(staffUsers)
    .set({ disabledAt: disable ? new Date() : null })
    .where(eq(staffUsers.id, id))
    .returning({ email: staffUsers.email });

  if (row && disable) await endSessionsFor(row.email);
  revalidatePath("/admin/staff");
}

export async function removeAdmin(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const id = idSchema.parse(formData.get("id"));

  const [row] = await db
    .delete(staffUsers)
    .where(eq(staffUsers.id, id))
    .returning({ email: staffUsers.email });

  if (row) await endSessionsFor(row.email);
  revalidatePath("/admin/staff");
}

export type PinState = { pin?: string; email?: string; error?: string; revoked?: boolean };

/**
 * Creates or replaces an Admin's sign-in PIN and signs them out everywhere.
 * The PIN goes back to the Super Admin's form once; only its hash is stored.
 */
export async function createAdminPin(id: number, _prev: PinState, formData: FormData): Promise<PinState> {
  await requireSuperAdmin();
  const adminId = idSchema.parse(id);
  if (formData.get("intent") === "revoke") {
    const email = await revokeStaffPin(db, adminId);
    if (!email) return { error: "That Admin no longer exists." };
    await endSessionsFor(email);
    revalidatePath("/admin/staff");
    return { revoked: true, email };
  }
  const created = await setStaffPin(db, adminId);
  if (!created) return { error: "That Admin no longer exists." };
  await endSessionsFor(created.email);
  revalidatePath("/admin/staff");
  return created;
}

export async function revokeAllPins(): Promise<void> {
  await requireSuperAdmin();
  for (const email of await revokeAllStaffPins(db)) await endSessionsFor(email);
  revalidatePath("/admin/staff");
}
