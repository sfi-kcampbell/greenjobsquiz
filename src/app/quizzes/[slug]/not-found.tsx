import { headers } from "next/headers";
import Link from "next/link";
import { messagesFor } from "@/lib/i18n";
import { LOCALES, pickLocale, type Locale } from "@/lib/i18n/locales";

/** Shown in the browser's language (the link doesn't say which language was wanted). */
async function browserLocale() {
  return pickLocale(null, (await headers()).get("accept-language"), Object.keys(LOCALES) as Locale[]);
}

export default async function QuizNotFound() {
  const locale = await browserLocale();
  const m = messagesFor(locale);
  return (
    <main lang={locale} className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">{m.quizUnavailable}</h1>
      <p className="text-muted">{m.quizUnavailableHint}</p>
      <p>
        <Link href="/" className="text-brand underline underline-offset-4">
          {m.seeAllQuizzes}
        </Link>
      </p>
    </main>
  );
}
