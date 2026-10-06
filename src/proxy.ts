import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { settings } from "@/lib/db/schema";

/**
 * Who may put a quiz in an <iframe>: `frame-ancestors` from Settings → Sites
 * allowed to embed (empty = any site, the spec's default). Read at most once
 * a minute per server instance; every other page is 'self' only (next.config.ts).
 */
const TTL_MS = 60_000;
let cache: { at: number; value: string } | null = null;

async function frameAncestors(): Promise<string> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  let value = "*";
  try {
    const [row] = await db.select({ origins: settings.embedOrigins }).from(settings).where(eq(settings.id, 1)).limit(1);
    if (row?.origins.length) value = `'self' ${row.origins.join(" ")}`;
  } catch (error) {
    console.error("[proxy] Couldn't read embed settings; allowing any site for now.", error);
  }
  cache = { at: Date.now(), value };
  return value;
}

export async function proxy(_request: NextRequest) {
  const res = NextResponse.next();
  res.headers.set("Content-Security-Policy", `frame-ancestors ${await frameAncestors()}`);
  return res;
}

export const config = {
  matcher: "/embed/:path*",
};
