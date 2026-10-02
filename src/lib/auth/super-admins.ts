/**
 * Super Admins are defined only by the SUPER_ADMINS env var: a comma-separated
 * list of email addresses. Membership is checked on every request and never
 * written to the database, so changing the env var (and redeploying) is the
 * only way to add or remove a Super Admin.
 *
 * Pure functions; no I/O.
 */

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function parseEmailList(raw: string | undefined | null): Set<string> {
  const emails = new Set<string>();
  if (!raw) return emails;
  for (const part of raw.split(",")) {
    const email = normalizeEmail(part);
    // Ignore blanks and obvious junk rather than failing the whole list.
    if (email && /^[^\s@]+@[^\s@]+$/.test(email)) emails.add(email);
  }
  return emails;
}

export function isSuperAdminEmail(
  email: string | null | undefined,
  raw: string | undefined = process.env.SUPER_ADMINS,
): boolean {
  if (!email) return false;
  return parseEmailList(raw).has(normalizeEmail(email));
}

export function listSuperAdmins(raw: string | undefined = process.env.SUPER_ADMINS): string[] {
  return [...parseEmailList(raw)].sort();
}
