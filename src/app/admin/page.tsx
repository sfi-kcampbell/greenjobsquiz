import Link from "next/link";
import { ConfigWarning } from "@/components/config-warning";
import { requireStaff } from "@/lib/auth/access";

export default async function AdminDashboard() {
  const staff = await requireStaff();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <ConfigWarning />
      <p className="text-muted">
        Signed in as {staff.email}. {staff.role === "super_admin" ? "You're a Super Admin." : "You're an Admin."}
      </p>
      <ul className="grid gap-4 sm:grid-cols-2">
        <li className="rounded-lg border border-border bg-surface p-4">
          <Link href="/admin/quizzes" className="font-medium text-brand">
            Quizzes
          </Link>
          <p className="mt-1 text-sm text-muted">Build quizzes, questions and responses.</p>
        </li>
        {staff.role === "super_admin" && (
          <li className="rounded-lg border border-border bg-surface p-4">
            <Link href="/admin/staff" className="font-medium text-brand">
              Staff
            </Link>
            <p className="mt-1 text-sm text-muted">Invite and manage Admins.</p>
          </li>
        )}
      </ul>
    </div>
  );
}
