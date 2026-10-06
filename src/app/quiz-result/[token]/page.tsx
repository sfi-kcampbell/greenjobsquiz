import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ResultBody } from "@/components/quiz/result-body";
import { db } from "@/lib/db/client";
import { getResultByShareToken } from "@/lib/public/sessions";
import { isToken } from "@/lib/public/tokens";
import { AutoPrint } from "./auto-print";
import { PrintButton } from "./print-button";

/**
 * A shared or printable result. The token is the credential, so the page is
 * never cached (dynamic → no-store) or indexed (meta here, header in
 * next.config.ts), and sends no referrer so the token can't leak to links.
 */
export const dynamic = "force-dynamic";

async function load(token: string) {
  const result = isToken(token) ? await getResultByShareToken(db, token) : null;
  if (!result) notFound();
  return result;
}

export async function generateMetadata({ params }: PageProps<"/quiz-result/[token]">): Promise<Metadata> {
  const result = await load((await params).token);
  return {
    title: `${result.match?.title ?? "Result"} · ${result.quiz.title}`,
    robots: { index: false, follow: false },
  };
}

export default async function SharedResultPage({ params, searchParams }: PageProps<"/quiz-result/[token]">) {
  const result = await load((await params).token);
  const autoprint = (await searchParams).autoprint === "1";
  const taken = new Date(result.createdAt).toLocaleDateString("en", { dateStyle: "long", timeZone: "UTC" });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      {autoprint && <AutoPrint />}
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted">{result.quiz.title}</p>
        <h1 className="text-3xl font-semibold">Quiz result</h1>
        <p className="text-sm text-muted">Taken {taken}</p>
      </header>

      <ResultBody result={result} />

      <div className="no-print flex flex-wrap items-center gap-3">
        <PrintButton />
        {result.quiz.deliveryMode === "hosted" && (
          <Link href={`/quizzes/${result.quiz.slug}`} className="rounded-md border border-border bg-surface px-4 py-2 font-medium hover:bg-border/40">
            Take this quiz
          </Link>
        )}
      </div>
    </main>
  );
}
