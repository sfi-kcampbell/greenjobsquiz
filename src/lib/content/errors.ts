/**
 * Expected failures from the content layer. Server actions turn these into
 * inline messages; anything else is a bug and is allowed to throw.
 */
export class ContentError extends Error {
  constructor(
    readonly code: "not_found" | "conflict" | "limit" | "invalid",
    message: string,
    /** The form field the message belongs to, if any. */
    readonly field?: string,
  ) {
    super(message);
    this.name = "ContentError";
  }
}

type PgErrorLike = { code?: string; constraint?: string };

/** Finds the underlying Postgres error (Drizzle wraps it in `cause`). */
export function pgError(error: unknown): PgErrorLike | null {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    const candidate = current as PgErrorLike & { cause?: unknown };
    if (typeof candidate.code === "string" && /^[0-9A-Z]{5}$/.test(candidate.code)) {
      return candidate;
    }
    current = candidate.cause;
  }
  return null;
}

export const PG_UNIQUE_VIOLATION = "23505";
export const PG_FOREIGN_KEY_VIOLATION = "23503";
/** What newer Postgres (e.g. Neon) reports for ON DELETE RESTRICT; older versions use 23503. */
export const PG_RESTRICT_VIOLATION = "23001";

/** The row is still referenced elsewhere (a foreign key refused the delete), on any Postgres version. */
export function isReferencedError(error: unknown): boolean {
  const code = pgError(error)?.code;
  return code === PG_FOREIGN_KEY_VIOLATION || code === PG_RESTRICT_VIOLATION;
}
