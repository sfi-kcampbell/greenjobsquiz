import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Anything queries can run on: the database or an open transaction. */
export type Executor = Database | Tx;

/**
 * The one place the Drizzle instance is configured, shared by the app
 * (client.ts) and the integration tests, so both use the same casing.
 */
export function createDb(pool: Pool): Database {
  return drizzle(pool, { schema, casing: "snake_case" });
}
