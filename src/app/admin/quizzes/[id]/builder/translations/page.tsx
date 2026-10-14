import type { Metadata } from "next";
import Link from "next/link";
import { translationEditor } from "@/lib/content/translations";
import { readWorkingContent } from "@/lib/content/versions";
import { db } from "@/lib/db/client";
import { EXTRA_LOCALES, isLocale, LOCALE_NAMES_EN, LOCALES } from "@/lib/i18n/locales";
import { sanitizeRichText } from "@/lib/sanitize/rich-text";
import { loadQuiz } from "../../load";
import { TranslationsEditor } from "./translations-editor";

export const metadata: Metadata = { title: "Translations" };

export default async function TranslationsPage({ params, searchParams }: PageProps<"/admin/quizzes/[id]/builder/translations">) {
  const quiz = await loadQuiz((await params).id);
  const asked = (await searchParams).lang;
  const locale = isLocale(asked) && asked !== "en" ? asked : (EXTRA_LOCALES.find((l) => quiz.languages.includes(l)) ?? EXTRA_LOCALES[0]);
  const content = await readWorkingContent(db, quiz.id);
  const fields = (await translationEditor(db, quiz.id, locale, content)).map((f) => ({
    ...f,
    // Shown read-only next to the translation.
    text: f.rich ? (sanitizeRichText(f.text) ?? "") : f.text,
  }));
  const offered = quiz.languages.includes(locale);

  return (
    <section aria-labelledby="translations-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="translations-heading" className="text-lg font-semibold">
          Translations
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Translate the quiz&apos;s text into another language. Anything left empty shows in English. Buttons and messages
          (Next, Back, &ldquo;See my result&rdquo;…) are translated already. Translations are part of the draft: publish
          changes to make them live.
        </p>
      </div>
      <nav aria-label="Language" className="flex flex-wrap gap-2 text-sm">
        {EXTRA_LOCALES.map((l) => (
          <Link
            key={l}
            href={`?lang=${l}`}
            aria-current={l === locale ? "page" : undefined}
            className={`rounded-md border px-3 py-1.5 font-medium ${l === locale ? "border-brand bg-brand/10" : "border-border hover:bg-border/40"}`}
          >
            {LOCALE_NAMES_EN[l]} <span lang={l}>({LOCALES[l]})</span>
          </Link>
        ))}
      </nav>
      {!offered && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          The quiz isn&apos;t offered in {LOCALE_NAMES_EN[locale]} yet. Turn it on in{" "}
          <Link href={`/admin/quizzes/${quiz.id}#languages`} className="underline underline-offset-4">
            quiz settings → Languages
          </Link>{" "}
          when the translation is ready.
        </p>
      )}
      {fields.length === 0 ? (
        <p className="text-sm text-muted">Nothing to translate yet: add questions and responses first.</p>
      ) : (
        <TranslationsEditor key={locale} quizId={quiz.id} locale={locale} languageName={LOCALE_NAMES_EN[locale]} initial={fields} />
      )}
    </section>
  );
}
