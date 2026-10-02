import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "@/auth";
import { requireStaff } from "@/lib/auth/access";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · PLT Quiz Admin" },
  robots: { index: false },
};

const ROLE_LABEL = { super_admin: "Super Admin", admin: "Admin" } as const;

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // Pages and actions check access themselves too; this only shapes the chrome.
  const staff = await requireStaff();
  const isSuper = staff.role === "super_admin";

  const nav = [
    { href: "/admin", label: "Dashboard" },
    { href: "/admin/quizzes", label: "Quizzes" },
    ...(isSuper
      ? [
          { href: "/admin/submissions", label: "Submissions" },
          { href: "/admin/staff", label: "Staff" },
          { href: "/admin/settings", label: "Settings" },
        ]
      : []),
  ];

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/sign-in" });
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
          <Link href="/admin" className="font-semibold">
            PLT Quiz
          </Link>
          <nav aria-label="Admin" className="flex flex-wrap gap-4 text-sm">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="text-muted hover:text-foreground">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-muted">
              {staff.email} · <span className="font-medium text-foreground">{ROLE_LABEL[staff.role]}</span>
            </span>
            <form action={signOutAction}>
              <button type="submit" className="text-brand underline underline-offset-4">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
