import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PageShell } from "@/components/quiz/page-shell";
import { QuizClient } from "@/components/quiz/quiz-client";
import { RichHtml } from "@/components/quiz/rich-html";
import { getCachedQuizPage } from "@/lib/public/page-cache";

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
  const info = await getCachedQuizPage(decodeURIComponent(slug));
  if (!info) notFound();
  // Headless: the quiz lives on its own front end (307, a temporary redirect).
  if (info.deliveryMode === "headless") {
    if (!info.headlessBaseUrl) notFound();
    redirect(`${info.headlessBaseUrl}/quizzes/${encodeURIComponent(info.quiz.slug)}`);
  }
  return info;
}

export async function generateMetadata({ params }: PageProps<"/quizzes/[slug]">): Promise<Metadata> {
  // No redirect here: the page does it (redirecting in both sends Location twice).
  const info = await getCachedQuizPage(decodeURIComponent((await params).slug));
  return info ? { title: info.quiz.title } : {};
}

export default async function QuizPage({ params }: PageProps<"/quizzes/[slug]">) {
  const { quiz, layoutTemplate } = await load((await params).slug);
  return (
    <PageShell template={layoutTemplate}>
      <h1 className="text-3xl font-semibold sm:text-4xl">{quiz.title}</h1>
      <QuizClient quizId={quiz.id} intro={<RichHtml html={quiz.introHtml} className="text-lg" />} />
    </PageShell>
  );
}
