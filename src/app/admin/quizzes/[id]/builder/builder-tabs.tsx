"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { slug: "categories", label: "Categories" },
  { slug: "questions", label: "Questions" },
  { slug: "job-types", label: "Job Types" },
  { slug: "simulate", label: "Simulate" },
  { slug: "health", label: "Health" },
] as const;

export function BuilderTabs({ quizId }: { quizId: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Builder" className="border-b border-border">
      <ul className="-mb-px flex flex-wrap gap-1">
        {TABS.map((tab) => {
          const href = `/admin/quizzes/${quizId}/builder/${tab.slug}`;
          const active = pathname === href;
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
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
