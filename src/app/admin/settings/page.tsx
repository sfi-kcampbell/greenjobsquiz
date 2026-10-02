import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth/access";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireSuperAdmin();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <p className="text-muted">Settings arrive in Phase 14.</p>
    </div>
  );
}
