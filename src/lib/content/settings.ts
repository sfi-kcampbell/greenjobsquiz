/**
 * The single site-wide settings row (id = 1). Created on first write; reads
 * fall back to the defaults when it doesn't exist yet.
 */
import { eq } from "drizzle-orm";
import type { Executor } from "@/lib/db/create";
import { settings } from "@/lib/db/schema";
import type { AccessSettingsInput } from "./validation";

export type AccessSettings = { embedOrigins: string[]; corsOrigins: string[] };

export async function getAccessSettings(db: Executor): Promise<AccessSettings> {
  const [row] = await db
    .select({ embedOrigins: settings.embedOrigins, corsOrigins: settings.corsOrigins })
    .from(settings)
    .where(eq(settings.id, 1))
    .limit(1);
  return row ?? { embedOrigins: [], corsOrigins: [] };
}

export async function updateAccessSettings(db: Executor, input: AccessSettingsInput): Promise<void> {
  await db
    .insert(settings)
    .values({ id: 1, embedOrigins: input.embedOrigins, corsOrigins: input.corsOrigins })
    .onConflictDoUpdate({
      target: settings.id,
      set: { embedOrigins: input.embedOrigins, corsOrigins: input.corsOrigins, updatedAt: new Date() },
    });
}
