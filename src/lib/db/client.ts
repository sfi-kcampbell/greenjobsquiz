import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import { createDb } from "./create";

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

export const db = createDb(pool);
export type { Database as Db } from "./create";
