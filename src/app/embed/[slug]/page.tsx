import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmbedBridge } from "@/components/quiz/embed-bridge";
import { QuizClient } from "@/components/quiz/quiz-client";
import { RichHtml } from "@/components/quiz/rich-html";
import { getCachedQuizPage } from "@/lib/public/page-cache";

/**
 * The quiz inside an <iframe> on another site. Identity uses a key in
 * localStorage sent as X-Quiz-Session (third-party cookies are blocked), and
 * the frame tells the host page its height. Who may frame it: src/proxy.ts.
 */
export const revalidate = 300;

export function generateStaticParams() {
  return [];
}

async function load(slug: string) {
  const info = await getCachedQuizPage(decodeURIComponent(slug));
  if (!info || info.deliveryMode === "headless") notFound();
  return info;
}

export async function generateMetadata({ params }: PageProps<"/embed/[slug]">): Promise<Metadata> {
  const { quiz } = await load((await params).slug);
  return { title: quiz.title, robots: { index: false } };
}

export default async function EmbedPage({ params }: PageProps<"/embed/[slug]">) {
  const { quiz } = await load((await params).slug);
  return (
    <EmbedBridge>
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 sm:p-6">
        <h1 className="text-2xl font-semibold sm:text-3xl">{quiz.title}</h1>
        <QuizClient quizId={quiz.id} mode="embed" intro={<RichHtml html={quiz.introHtml} className="text-lg" />} />
      </main>
    </EmbedBridge>
  );
}
