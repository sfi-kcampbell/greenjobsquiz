import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth/access";

export const metadata: Metadata = { title: "Quizzes" };

export default async function QuizzesPage() {
  await requireStaff();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Quizzes</h1>
      <p className="text-muted">The quiz builder arrives in Phase 1.</p>
    </div>
  );
}
