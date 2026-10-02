import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { staffUsers } from "@/lib/db/schema";
import { isSuperAdminEmail, normalizeEmail } from "./super-admins";

export type StaffRole = "super_admin" | "admin";
export type Staff = { email: string; name: string | null; role: StaffRole };

/**
 * Works out whether an email belongs to active staff. Used both at sign-in
 * (to refuse unknown emails) and on every request (so disabling an Admin, or
 * removing a Super Admin from the env var, takes effect immediately).
 */
export async function resolveStaff(email: string | null | undefined): Promise<Staff | null> {
  if (!email) return null;
  const normalized = normalizeEmail(email);

  if (isSuperAdminEmail(normalized)) {
    return { email: normalized, name: null, role: "super_admin" };
  }

  const [row] = await db
    .select({ email: staffUsers.email, name: staffUsers.name })
    .from(staffUsers)
    .where(and(eq(staffUsers.email, normalized), isNull(staffUsers.disabledAt)))
    .limit(1);

  return row ? { email: row.email, name: row.name, role: "admin" } : null;
}
