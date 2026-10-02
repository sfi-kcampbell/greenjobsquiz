/**
 * Applies pending migrations from ./drizzle. Runs as part of `npm run build`,
 * so every Vercel deployment (and its Neon preview branch) is migrated before
 * the new code goes live.
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

  if (!url) {
    if (process.env.VERCEL) {
      throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL must be set on Vercel.");
    }
    console.warn("[migrate] No DATABASE_URL set; skipping migrations.");
    return;
  }

  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    console.log("[migrate] Database is up to date.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] Failed:", err);
  process.exit(1);
});
