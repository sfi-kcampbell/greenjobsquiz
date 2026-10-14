import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/quiz/page-shell";
import { lookupShortCode } from "@/lib/content/quiz-codes";
import { longDate, messagesFor } from "@/lib/i18n";
import { LOCALES, pickLocale, type Locale } from "@/lib/i18n/locales";
import { db } from "@/lib/db/client";
import { clientIpHash, hit } from "@/lib/rate-limit/fixed-window";

/**
 * Short links for mailers, QR codes and classes: /q/{CODE} opens the quiz
 * with the code applied, or explains why the code can't be used.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Quiz code", robots: { index: false } };

export default async function ShortCodePage({ params, searchParams }: PageProps<"/q/[code]">) {
  const raw = decodeURIComponent((await params).code);
  // ?lang= is passed on to the quiz; problems here are shown in it (or the browser's language).
  const lang = (await searchParams).lang;
  const locale = pickLocale(lang, (await headers()).get("accept-language"), Object.keys(LOCALES) as Locale[]);
  const m = messagesFor(locale);
  const limit = await hit(`q:ip:${await clientIpHash()}`, 60, 3600);
  if (!limit.allowed) return <Problem locale={locale} message={m.tooManyCodes} />;

  const { resolved, quiz } = await lookupShortCode(db, raw);
  if (resolved.ok && quiz) {
    const langPart = typeof lang === "string" && lang in LOCALES ? `&lang=${lang}` : "";
    const path = `/quizzes/${encodeURIComponent(quiz.slug)}?code=${encodeURIComponent(resolved.code)}${langPart}`;
    redirect(quiz.deliveryMode === "headless" && quiz.headlessBaseUrl ? `${quiz.headlessBaseUrl}${path}` : path);
  }
  const reason = resolved.ok ? "not_found" : resolved.reason;
  const base = reason === "not_open_yet" ? m.codeNotOpenYet : reason === "closed" ? m.codeClosed : m.codeNotFound;
  const message =
    !resolved.ok && resolved.reason === "not_open_yet" && resolved.opensAt
      ? `${base} ${m.codeOpensOn(longDate(locale, resolved.opensAt, { utc: true }))}`
      : base;
  return <Problem locale={locale} title={quiz?.title} message={message} />;
}

function Problem({ locale, title, message }: { locale: Locale; title?: string; message: string }) {
  const m = messagesFor(locale);
  return (
    <PageShell template="default">
      <div lang={locale} className="flex flex-col gap-4">
        {title && <p className="text-sm font-medium text-muted">{title}</p>}
        <h1 className="text-2xl font-semibold">{m.codeProblemTitle}</h1>
        <p role="alert" className="text-lg">
          {message}
        </p>
        <p>
          <Link href="/quizzes" className="text-brand underline underline-offset-4">
            {m.seeAllQuizzes}
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
