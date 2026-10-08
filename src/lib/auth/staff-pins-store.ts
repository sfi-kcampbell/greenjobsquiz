/** Storing and checking Admins' sign-in PINs (see staff-pin.ts). */
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { Executor } from "@/lib/db/create";
import { staffUsers } from "@/lib/db/schema";
import { normalizeEmail } from "./super-admins";
import { generatePin, hashPin, verifyPin } from "./staff-pin";

/** Creates (or replaces) an Admin's PIN. Returns the PIN to show once, or null if there's no such Admin. */
export async function setStaffPin(db: Executor, id: number): Promise<{ email: string; pin: string } | null> {
  const pin = generatePin();
  const [row] = await db
    .update(staffUsers)
    .set({ pinHash: await hashPin(pin), pinSetAt: new Date() })
    .where(eq(staffUsers.id, id))
    .returning({ email: staffUsers.email });
  return row ? { email: row.email, pin } : null;
}

export async function revokeStaffPin(db: Executor, id: number): Promise<string | null> {
  const [row] = await db
    .update(staffUsers)
    .set({ pinHash: null, pinSetAt: null })
    .where(eq(staffUsers.id, id))
    .returning({ email: staffUsers.email });
  return row?.email ?? null;
}

/** Returns the emails whose PINs were revoked. */
export async function revokeAllStaffPins(db: Executor): Promise<string[]> {
  const rows = await db
    .update(staffUsers)
    .set({ pinHash: null, pinSetAt: null })
    .where(isNotNull(staffUsers.pinHash))
    .returning({ email: staffUsers.email });
  return rows.map((r) => r.email);
}

/** Whether any active Admin can sign in with a PIN (decides whether /sign-in shows the PIN card). */
export async function anyStaffPins(db: Executor): Promise<boolean> {
  const [row] = await db
    .select({ id: staffUsers.id })
    .from(staffUsers)
    .where(and(isNotNull(staffUsers.pinHash), isNull(staffUsers.disabledAt)))
    .limit(1);
  return Boolean(row);
}

/**
 * Whether `pin` is this active Admin's PIN. Always does one scrypt check, so
 * an unknown, disabled or PIN-less email takes as long as a wrong PIN.
 */
export async function staffPinMatches(db: Executor, email: string, pin: string): Promise<boolean> {
  const [row] = await db
    .select({ pinHash: staffUsers.pinHash })
    .from(staffUsers)
    .where(and(eq(staffUsers.email, normalizeEmail(email)), isNull(staffUsers.disabledAt)))
    .limit(1);
  return verifyPin(pin, row?.pinHash);
}
