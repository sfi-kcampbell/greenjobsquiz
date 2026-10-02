import "server-only";
import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db/client";
import { sessions, users } from "@/lib/db/schema";
import { normalizeEmail } from "./super-admins";

const PIN_SESSION_HOURS = 12;
const PIN_TOKEN_PREFIX = "pin_";
const SESSION_COOKIES = ["__Secure-authjs.session-token", "authjs.session-token"];

/**
 * PIN session tokens look like `pin_<issued unix seconds>_<random hex>`.
 * Auth.js slides every session's expiry forward on use, so the 12-hour limit
 * is enforced from the issue time in the token instead (see access.ts).
 */
export async function pinSessionExpired(): Promise<boolean> {
  const jar = await cookies();
  const token = SESSION_COOKIES.map((name) => jar.get(name)?.value).find(Boolean);
  if (!token?.startsWith(PIN_TOKEN_PREFIX)) return false;
  const issued = Number(token.split("_")[1]);
  return !Number.isFinite(issued) || Date.now() / 1000 - issued > PIN_SESSION_HOURS * 60 * 60;
}

/** Auth.js prefixes its cookie with __Secure- on HTTPS; match it exactly. */
async function isHttps(): Promise<boolean> {
  const proto = (await headers()).get("x-forwarded-proto");
  if (proto) return proto.split(",")[0].trim() === "https";
  return (process.env.APP_URL ?? "").startsWith("https://");
}

/**
 * Creates a normal Auth.js database session for an already-verified staff
 * email and sets the session cookie, so auth(), sign-out and disabling an
 * Admin all behave exactly as they do after a magic-link sign-in.
 */
export async function createStaffSession(email: string): Promise<void> {
  const normalized = normalizeEmail(email);

  const [user] = await db
    .insert(users)
    .values({ email: normalized })
    .onConflictDoUpdate({ target: users.email, set: { email: normalized } })
    .returning({ id: users.id });

  const issued = Math.floor(Date.now() / 1000);
  const sessionToken = `${PIN_TOKEN_PREFIX}${issued}_${randomBytes(32).toString("hex")}`;
  const expires = new Date(Date.now() + PIN_SESSION_HOURS * 60 * 60 * 1000);
  await db.insert(sessions).values({ sessionToken, userId: user.id, expires });

  const secure = await isHttps();
  (await cookies()).set(`${secure ? "__Secure-" : ""}authjs.session-token`, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    expires,
  });
}
