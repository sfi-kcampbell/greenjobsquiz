import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth/access";

export const metadata: Metadata = { title: "Submissions" };

export default async function SubmissionsPage() {
  await requireSuperAdmin();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Submissions</h1>
      <p className="text-muted">Submissions and CSV export arrive in Phase 12.</p>
    </div>
  );
}
