import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Banner } from "@/components/quiz/banner";
import { CustomCss } from "@/components/quiz/custom-css";
import { EmbedBridge } from "@/components/quiz/embed-bridge";
import { QuizClient } from "@/components/quiz/quiz-client";
import { RichHtml } from "@/components/quiz/rich-html";
import { getCachedSiteCss, getLocalizedQuizPage } from "@/lib/public/page-cache";

/**
 * The quiz inside an <iframe> on another site. Identity uses a key in
 * localStorage sent as X-Quiz-Session (third-party cookies are blocked), and
 * the frame tells the host page its height. Who may frame it: src/proxy.ts.
 */
export const dynamic = "force-dynamic";

async function load(slug: string, lang: unknown) {
  // The language: data-lang on the embed script (?lang=), else the browser's.
  const info = await getLocalizedQuizPage(decodeURIComponent(slug), lang, (await headers()).get("accept-language"));
  if (!info || info.deliveryMode === "headless") notFound();
  return info;
}

export async function generateMetadata({ params, searchParams }: PageProps<"/embed/[slug]">): Promise<Metadata> {
  const { quiz } = await load((await params).slug, (await searchParams).lang);
  return { title: quiz.title, robots: { index: false } };
}

export default async function EmbedPage({ params, searchParams }: PageProps<"/embed/[slug]">) {
  const { quiz, customCss } = await load((await params).slug, (await searchParams).lang);
  return (
    <EmbedBridge>
      <CustomCss site={await getCachedSiteCss()} quiz={customCss} />
      <main lang={quiz.locale} className="pltq-quiz mx-auto flex w-full max-w-2xl flex-col gap-6 p-4 sm:p-6">
        <Banner banner={quiz.banner} />
        <h1 className="pltq-title text-2xl font-semibold sm:text-3xl">{quiz.title}</h1>
        <QuizClient quizId={quiz.id} mode="embed" locale={quiz.locale} languages={quiz.languages} intro={<RichHtml html={quiz.introHtml} className="pltq-intro text-lg" />} />
      </main>
    </EmbedBridge>
  );
}
