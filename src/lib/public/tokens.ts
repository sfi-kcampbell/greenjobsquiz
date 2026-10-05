/**
 * Respondent tokens. The raw token lives only in the respondent's cookie or
 * header; the database stores HMAC-SHA256(token, TOKEN_PEPPER), so a database
 * leak never hands out live sessions or share links.
 *
 * TOKEN_PEPPER must never change once set: every session and share link
 * would stop working.
 */
import { createHmac, randomBytes } from "node:crypto";

export const TOKEN_PATTERN = /^[a-f0-9]{32,64}$/;

let warned = false;
function pepper(): string {
  const value = process.env.TOKEN_PEPPER;
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error("TOKEN_PEPPER is not set. Set it to a long random value in the environment.");
  }
  if (!warned) {
    warned = true;
    console.warn("[tokens] TOKEN_PEPPER is not set; using an insecure development value.");
  }
  return "development-only-pepper";
}

/** A new respondent token: 32 random bytes, hex (64 characters). */
export function newToken(): string {
  return randomBytes(32).toString("hex");
}

/** What the database stores for a token (64 hex characters). */
export function hashToken(token: string): string {
  return createHmac("sha256", pepper()).update(token).digest("hex");
}

/**
 * The share token for a submission. Derived (not random) so a repeated
 * submit returns the same link; revocable by clearing the stored hash.
 * 32 hex characters = 128 bits.
 */
export function shareTokenFor(sessionTokenHash: string, submissionId: number): string {
  return createHmac("sha256", pepper()).update(`share:${sessionTokenHash}:${submissionId}`).digest("hex").slice(0, 32);
}

export function isToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

/**
 * Settings respondents can't do without, for warnings in the admin. Without
 * TOKEN_PEPPER every answer save fails in production (by design: see pepper()).
 */
export function missingPublicConfig(env: Record<string, string | undefined> = process.env): string[] {
  const problems: string[] = [];
  if (!env.TOKEN_PEPPER && env.NODE_ENV === "production") problems.push("TOKEN_PEPPER");
  return problems;
}
