import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Check your email", robots: { index: false } };

export default function CheckEmailPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">Check your email</h1>
      <p className="text-muted">
        We sent you a sign-in link. It expires in 15 minutes and can be used once.
      </p>
      <p>
        <Link href="/sign-in" className="text-brand underline underline-offset-4">
          Use a different email
        </Link>
      </p>
    </main>
  );
}
