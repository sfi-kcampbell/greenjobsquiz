import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * One pg Pool per server instance, against Neon's pooled connection string.
 *
 * We use node-postgres rather than Neon's HTTP driver because the builder
 * needs real interactive transactions (reordering, cascading saves), and it
 * lets local development and tests run against a plain Postgres.
 */
const globalForDb = globalThis as unknown as { pgPool?: Pool };

const pool =
  globalForDb.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 5_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pgPool = pool;
}

// Lets Vercel Fluid compute close idle clients before suspending a function.
attachDatabasePool(pool);

export const db = drizzle(pool, { schema, casing: "snake_case" });
export type Db = typeof db;
