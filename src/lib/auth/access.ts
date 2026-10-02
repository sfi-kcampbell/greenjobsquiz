import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/auth";
import { resolveStaff, type Staff } from "./staff";

export type { Staff, StaffRole } from "./staff";

/** The signed-in staff member for this request, or null. Memoized per request. */
export const getStaff = cache(async (): Promise<Staff | null> => {
  const session = await auth();
  const staff = await resolveStaff(session?.user?.email);
  if (staff && session?.user?.name) staff.name ??= session.user.name;
  return staff;
});

/**
 * Call at the top of every admin page, server action and admin route handler.
 * Hiding navigation is never access control.
 */
export async function requireStaff(): Promise<Staff> {
  const staff = await getStaff();
  if (!staff) redirect("/sign-in");
  return staff;
}

export async function requireSuperAdmin(): Promise<Staff> {
  const staff = await requireStaff();
  if (staff.role !== "super_admin") notFound();
  return staff;
}
