import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { QuizClient } from "@/components/quiz/quiz-client";
import { RichHtml } from "@/components/quiz/rich-html";
import { getCachedQuizBySlug } from "@/lib/public/page-cache";

/**
 * The hosted quiz page. Only the title and intro are rendered here, the same
 * for everyone, so the HTML is cached; progress and results come from the API.
 * Pages render on first request and stay cached until an admin change expires
 * the "quiz-pages" tag (or five minutes pass).
 */
export const revalidate = 300;

export function generateStaticParams() {
  return [];
}

async function load(slug: string) {
  const quiz = await getCachedQuizBySlug(decodeURIComponent(slug));
  if (!quiz) notFound();
  return quiz;
}

export async function generateMetadata({ params }: PageProps<"/quizzes/[slug]">): Promise<Metadata> {
  const quiz = await load((await params).slug);
  return { title: quiz.title };
}

export default async function QuizPage({ params }: PageProps<"/quizzes/[slug]">) {
  const quiz = await load((await params).slug);

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-2xl items-center px-4 py-3 sm:px-6">
          <Link href="/" className="font-semibold text-brand">
            PLT Quiz
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
        <h1 className="text-3xl font-semibold sm:text-4xl">{quiz.title}</h1>
        <QuizClient quizId={quiz.id} intro={<RichHtml html={quiz.introHtml} className="text-lg" />} />
      </main>
    </div>
  );
}
