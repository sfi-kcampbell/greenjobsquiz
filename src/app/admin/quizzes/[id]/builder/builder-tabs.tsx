"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { slug: "categories", label: "Categories" },
  { slug: "questions", label: "Questions" },
  { slug: "responses", label: "Responses" },
  { slug: "simulate", label: "Simulate" },
  { slug: "health", label: "Health" },
] as const;

export function BuilderTabs({ quizId, healthCount }: { quizId: number; healthCount: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Builder" className="border-b border-border">
      <ul className="-mb-px flex flex-wrap gap-1">
        {TABS.map((tab) => {
          const href = `/admin/quizzes/${quizId}/builder/${tab.slug}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={tab.slug}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`inline-block border-b-2 px-4 py-2 text-sm font-medium ${
                  active
                    ? "border-brand text-foreground"
                    : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                {tab.label}
                {tab.slug === "health" && healthCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                    {healthCount}
                    <span className="sr-only"> {healthCount === 1 ? "warning" : "warnings"}</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
