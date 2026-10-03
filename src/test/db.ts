/**
 * Integration-test database. Set TEST_DATABASE_URL to a throwaway Postgres
 * database (never a real one: every table is truncated between tests).
 */
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { createDb, type Database } from "@/lib/db/create";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

let pool: Pool | null = null;
let db: Database | null = null;

export async function setupTestDb(): Promise<Database> {
  if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is not set");
  pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 4 });
  db = createDb(pool);
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

export async function resetTestDb(): Promise<void> {
  const { rows } = await pool!.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public'",
  );
  const tables = rows.map((r) => `"${r.tablename}"`).join(", ");
  if (tables) await db!.execute(sql.raw(`truncate ${tables} restart identity cascade`));
}

export async function teardownTestDb(): Promise<void> {
  await pool?.end();
  pool = null;
  db = null;
}
