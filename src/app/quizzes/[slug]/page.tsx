import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Banner } from "@/components/quiz/banner";
import { CustomCss } from "@/components/quiz/custom-css";
import { PageShell } from "@/components/quiz/page-shell";
import { QuizClient } from "@/components/quiz/quiz-client";
import { RichHtml } from "@/components/quiz/rich-html";
import { getCachedSiteCss, getLocalizedQuizPage } from "@/lib/public/page-cache";

/**
 * The hosted quiz page. Only the title and intro are rendered here, in the
 * respondent's language (?lang=, else the browser's); progress and results
 * come from the API. The quiz data is cached per language until an admin
 * change expires the "quiz-pages" tag (or five minutes pass).
 */
export const dynamic = "force-dynamic";

async function load(slug: string, lang: unknown) {
  const info = await getLocalizedQuizPage(decodeURIComponent(slug), lang, (await headers()).get("accept-language"));
  if (!info) notFound();
  // Headless: the quiz lives on its own front end (307, a temporary redirect).
  if (info.deliveryMode === "headless") {
    if (!info.headlessBaseUrl) notFound();
    redirect(`${info.headlessBaseUrl}/quizzes/${encodeURIComponent(info.quiz.slug)}${typeof lang === "string" ? `?lang=${encodeURIComponent(lang)}` : ""}`);
  }
  return info;
}

export async function generateMetadata({ params, searchParams }: PageProps<"/quizzes/[slug]">): Promise<Metadata> {
  // No redirect here: the page does it (redirecting in both sends Location twice).
  const info = await getLocalizedQuizPage(
    decodeURIComponent((await params).slug),
    (await searchParams).lang,
    (await headers()).get("accept-language"),
  );
  return info ? { title: info.quiz.title } : {};
}

export default async function QuizPage({ params, searchParams }: PageProps<"/quizzes/[slug]">) {
  const { quiz, layoutTemplate, customCss } = await load((await params).slug, (await searchParams).lang);
  return (
    <PageShell template={layoutTemplate}>
      <CustomCss site={await getCachedSiteCss()} quiz={customCss} />
      <div lang={quiz.locale} className="pltq-quiz flex flex-col gap-6">
        <Banner banner={quiz.banner} />
        <h1 className="pltq-title text-3xl font-semibold sm:text-4xl">{quiz.title}</h1>
        <QuizClient
          quizId={quiz.id}
          locale={quiz.locale}
          languages={quiz.languages}
          intro={<RichHtml html={quiz.introHtml} className="pltq-intro text-lg" />}
        />
      </div>
    </PageShell>
  );
}
