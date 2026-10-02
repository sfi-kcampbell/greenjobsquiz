/**
 * Temporary PIN sign-in, for use while email sending isn't set up.
 * Pure functions; the session side lives in pin-session.ts.
 *
 * Remove SECRET_PIN from the environment before launch to turn this off.
 */
import { createHash, timingSafeEqual } from "node:crypto";

export const MIN_PIN_LENGTH = 6;

export function pinSignInEnabled(raw: string | undefined = process.env.SECRET_PIN): boolean {
  return typeof raw === "string" && raw.length >= MIN_PIN_LENGTH;
}

/** Constant-time comparison: hashing first makes both buffers the same length. */
export function pinMatches(input: string, raw: string | undefined = process.env.SECRET_PIN): boolean {
  if (!pinSignInEnabled(raw) || !input) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(raw as string).digest();
  return timingSafeEqual(a, b);
}
