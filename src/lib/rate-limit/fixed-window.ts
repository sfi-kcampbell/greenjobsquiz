import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/lib/db/client";

export type RateLimitResult = { allowed: boolean; count: number; retryAfterSeconds: number };

/**
 * Fixed-window counter in the rate_limits table: one atomic upsert per hit.
 * For this limiter the `tokens` column holds the hit count in the current
 * window and `refilled_at` the window start.
 */
export async function hit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const result = await db.execute<{ count: string; window_start: Date }>(sql`
    insert into rate_limits (bucket_key, tokens, refilled_at)
    values (${key}, 1, now())
    on conflict (bucket_key) do update set
      tokens = case
        when rate_limits.refilled_at <= now() - make_interval(secs => ${windowSeconds}) then 1
        else rate_limits.tokens + 1
      end,
      refilled_at = case
        when rate_limits.refilled_at <= now() - make_interval(secs => ${windowSeconds}) then now()
        else rate_limits.refilled_at
      end
    returning tokens as count, refilled_at as window_start
  `);

  const row = result.rows[0];
  const count = Number(row.count);
  const elapsed = (Date.now() - new Date(row.window_start).getTime()) / 1000;
  return {
    allowed: count <= limit,
    count,
    retryAfterSeconds: Math.max(1, Math.ceil(windowSeconds - elapsed)),
  };
}

/** A hash of the caller's IP, so raw addresses are never stored. */
export async function clientIpHash(): Promise<string> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
  return createHash("sha256")
    .update(`${process.env.TOKEN_PEPPER ?? ""}:${ip}`)
    .digest("hex");
}
