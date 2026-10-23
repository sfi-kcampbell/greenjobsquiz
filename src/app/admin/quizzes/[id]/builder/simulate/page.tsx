import type { Metadata } from "next";
import Link from "next/link";
import { localizeContent } from "@/lib/content/localize";
import { subResponsesFor } from "@/lib/content/sub-response-list";
import { bundleFromContent, readWorkingContent } from "@/lib/content/versions";
import { db } from "@/lib/db/client";
import { EXTRA_LOCALES, isLocale, LOCALE_NAMES_EN, type Locale } from "@/lib/i18n/locales";
import { loadBundle, loadQuiz } from "../../load";
import { SimulatorLoader } from "./loader";

export const metadata: Metadata = { title: "Simulate" };

export default async function SimulatePage({ params, searchParams }: PageProps<"/admin/quizzes/[id]/builder/simulate">) {
  const quiz = await loadQuiz((await params).id);
  const bundle = await loadBundle(quiz.id);
  // Preview the text in another language (scoring is the same in every language).
  const asked = (await searchParams).lang;
  const locale: Locale = isLocale(asked) ? asked : "en";
  const content = localizeContent(await readWorkingContent(db, quiz.id), locale);
  const display = locale === "en" ? bundle.display : bundleFromContent(content).display;
  const subResponses = Object.fromEntries(content.responses.map((r) => [r.id, subResponsesFor(content, r.id)]));

  return (
    <section aria-labelledby="simulate-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="simulate-heading" className="text-lg font-semibold">
          Simulate
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Answer as a respondent would and watch the result update. This uses the same scoring the public quiz
          will use, with the saved questions, responses and scoring settings. Nothing here is recorded.
        </p>
      </div>
      <nav aria-label="Preview language" className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Language:</span>
        {(["en", ...EXTRA_LOCALES] as Locale[]).map((l) => (
          <Link
            key={l}
            href={l === "en" ? "?" : `?lang=${l}`}
            aria-current={l === locale ? "page" : undefined}
            className={`rounded-md border px-2.5 py-1 ${l === locale ? "border-brand bg-brand/10 font-medium" : "border-border hover:bg-border/40"}`}
          >
            {LOCALE_NAMES_EN[l]}
          </Link>
        ))}
      </nav>
      <SimulatorLoader
        key={locale}
        quizId={quiz.id}
        model={bundle.model}
        display={display}
        runnersUpCount={bundle.settings.runnersUpCount}
        subResponses={subResponses}
        subResponseLimit={content.scoring.subResponseLimit}
      />
    </section>
  );
}
