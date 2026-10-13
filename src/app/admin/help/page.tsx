import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth/access";
import { FAQ } from "./faq";

export const metadata: Metadata = { title: "Help" };

export default async function HelpPage() {
  const staff = await requireStaff();
  const isSuper = staff.role === "super_admin";
  const sections = FAQ.filter((s) => isSuper || !s.superAdminOnly);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Help</h1>
        <p className="mt-1 text-sm text-muted">Answers to common questions and step-by-step how-tos.</p>
      </div>

      <nav aria-labelledby="help-topics" className="rounded-lg border border-border bg-surface p-4 text-sm">
        <h2 id="help-topics" className="font-semibold">
          Topics
        </h2>
        <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-brand underline underline-offset-4">
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {sections.map((s) => (
        <section
          key={s.id}
          aria-labelledby={s.id}
          className={`flex scroll-mt-4 flex-col gap-2 ${s.superAdminOnly ? "mt-4 border-t border-border pt-6" : ""}`}
        >
          <h2 id={s.id} className="font-semibold">
            {s.title}
          </h2>
          {s.superAdminOnly && <p className="text-sm text-muted">Only Super Admins see this section.</p>}
          <div className="divide-y divide-border rounded-lg border border-border bg-surface">
            {s.items.map((item) => (
              <details key={item.id} id={item.id} className="scroll-mt-4 px-4 py-3">
                <summary className="cursor-pointer font-medium marker:text-muted">{item.question}</summary>
                <div className="mt-2 flex flex-col gap-2 text-sm">{item.answer}</div>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
