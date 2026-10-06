import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth/access";
import { getAccessSettings } from "@/lib/content/settings";
import { db } from "@/lib/db/client";
import { AccessSettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireSuperAdmin();
  const access = await getAccessSettings(db);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <section aria-labelledby="access" className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
        <h2 id="access" className="font-semibold">
          Embedding and API access
        </h2>
        <AccessSettingsForm embedOrigins={access.embedOrigins} corsOrigins={access.corsOrigins} />
      </section>
      <p className="text-sm text-muted">Privacy and data retention settings arrive in Phase 14.</p>
    </div>
  );
}
