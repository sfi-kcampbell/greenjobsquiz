import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStaff } from "@/lib/auth/access";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Staff sign-in", robots: { index: false } };

// Auth.js sends errors back here as ?error=<type>.
const ERRORS: Record<string, string> = {
  AccessDenied: "That email isn't authorized to sign in. Ask a Super Admin to invite you.",
  Verification: "That sign-in link has expired or was already used. Request a new one.",
};

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  if (await getStaff()) redirect("/admin");

  const params = await searchParams;
  const errorKey = typeof params.error === "string" ? params.error : undefined;
  const error = errorKey ? (ERRORS[errorKey] ?? "Something went wrong. Please try again.") : null;
  const email = typeof params.email === "string" ? params.email : undefined;

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="text-2xl font-semibold">Staff sign-in</h1>
        <p className="mt-2 text-muted">We&apos;ll email you a link to sign in. No password needed.</p>
      </div>
      {error && (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
          {error}
        </p>
      )}
      <SignInForm defaultEmail={email} />
    </main>
  );
}
