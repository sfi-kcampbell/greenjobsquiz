import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Banner } from "@/components/quiz/banner";
import { CustomCss } from "@/components/quiz/custom-css";
import { ResultBody } from "@/components/quiz/result-body";
import { getSiteCss } from "@/lib/content/settings";
import { db } from "@/lib/db/client";
import { getResultByShareToken } from "@/lib/public/sessions";
import { getQuizBranding } from "@/lib/public/structure";
import { CARD_SIZE, cardContent, shareMetadataText } from "@/lib/public/share-card";
import { isToken } from "@/lib/public/tokens";
import { requestOrigin } from "@/lib/app-url";
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
  const token = (await params).token;
  const result = await load(token);
  // Link previews (social media, iMessage, Slack, Teams) show the share card.
  const text = shareMetadataText(result);
  const image = { url: `${await requestOrigin()}/quiz-result/${token}/card`, ...CARD_SIZE, alt: cardContent(result).alt };
  return {
    title: `${result.match?.title ?? "Result"} · ${result.quiz.title}`,
    robots: { index: false, follow: false },
    openGraph: { type: "website", title: text.title, description: text.description, images: [image] },
    twitter: { card: "summary_large_image", title: text.title, description: text.description, images: [image] },
  };
}

export default async function SharedResultPage({ params, searchParams }: PageProps<"/quiz-result/[token]">) {
  const result = await load((await params).token);
  const autoprint = (await searchParams).autoprint === "1";
  const branding = await getQuizBranding(db, result.quiz.id);
  const siteCss = await getSiteCss(db);
  const taken = new Date(result.createdAt).toLocaleDateString("en", { dateStyle: "long", timeZone: "UTC" });

  return (
    <main className="pltq-quiz pltq-result mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <CustomCss site={siteCss} quiz={branding.customCss} />
      {autoprint && <AutoPrint />}
      <Banner banner={branding.banner} />
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted">{result.quiz.title}</p>
        <h1 className="pltq-title text-3xl font-semibold">Quiz result</h1>
        <p className="text-sm text-muted">Taken {taken}</p>
      </header>

      <ResultBody result={result} />

      <div className="no-print flex flex-wrap items-center gap-3">
        <PrintButton />
        <a
          href={`/quiz-result/${(await params).token}/card?download=1`}
          download
          className="pltq-button rounded-md border border-border bg-surface px-4 py-2 font-medium hover:bg-border/40"
        >
          Download image
        </a>
        {result.quiz.deliveryMode === "hosted" && (
          <Link href={`/quizzes/${result.quiz.slug}`} className="pltq-button rounded-md border border-border bg-surface px-4 py-2 font-medium hover:bg-border/40">
            Take this quiz
          </Link>
        )}
      </div>
    </main>
  );
}
