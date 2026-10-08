/**
 * Per-person sign-in PINs for Admins (temporary, while email sign-in isn't
 * set up). Only an scrypt hash is stored; the PIN is shown once when created.
 */
import { randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual, type BinaryLike, type ScryptOptions } from "node:crypto";

/** No 0/O, 1/I/L: easy to read out and type. */
export const PIN_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const PIN_LENGTH = 12;

const SCRYPT = { N: 16384, r: 8, p: 1 } as const;
const KEY_LENGTH = 32;

function scrypt(pin: BinaryLike, salt: BinaryLike, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(pin, salt, KEY_LENGTH, options, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** A new random PIN, formatted ABCD-EFGH-JKMN (about 59 bits). */
export function generatePin(): string {
  const chars = Array.from({ length: PIN_LENGTH }, () => PIN_ALPHABET[randomInt(PIN_ALPHABET.length)]);
  return chars.join("").match(/.{4}/g)!.join("-");
}

/** Case, spaces and dashes don't matter when typing a PIN. */
export function normalizePin(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, "");
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(normalizePin(pin), salt, SCRYPT);
  return `scrypt$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

/**
 * Compared against when there's no PIN to check (unknown email, no PIN set),
 * so those answers take as long as a real check and can't be told apart.
 */
export const DUMMY_HASH = `scrypt$${"A".repeat(22)}$${"A".repeat(43)}`;

export async function verifyPin(input: string, stored: string | null | undefined): Promise<boolean> {
  const [scheme, saltText, keyText] = (stored ?? DUMMY_HASH).split("$");
  if (scheme !== "scrypt" || !saltText || !keyText) return false;
  const expected = Buffer.from(keyText, "base64url");
  const actual = await scrypt(normalizePin(input), Buffer.from(saltText, "base64url"), SCRYPT);
  const same = expected.length === actual.length && timingSafeEqual(expected, actual);
  // The dummy never matches, whatever is typed.
  return same && stored !== null && stored !== undefined && stored !== DUMMY_HASH;
}
