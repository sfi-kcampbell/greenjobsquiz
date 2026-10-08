import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The page around a quiz. "default": site header and footer. "canvas":
 * distraction-free, just the content (also used by the embed).
 */
export function PageShell({ template, children }: { template: "default" | "canvas"; children: ReactNode }) {
  if (template === "canvas") {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">{children}</main>
    );
  }
  return (
    <div className="flex flex-1 flex-col">
      <header className="pltq-site-header no-print border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="font-semibold text-brand">
            PLT Quiz
          </Link>
          <Link href="/quizzes" className="text-sm text-muted hover:text-foreground">
            All quizzes
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">{children}</main>
      <footer className="pltq-site-footer no-print border-t border-border">
        <div className="mx-auto w-full max-w-2xl px-4 py-4 text-sm text-muted sm:px-6">PLT Green Jobs Quiz</div>
      </footer>
    </div>
  );
}
