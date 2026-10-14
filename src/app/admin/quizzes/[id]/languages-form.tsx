"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "@/lib/content/action-result";
import { LOCALE_NAMES_EN, LOCALES, type Locale } from "@/lib/i18n/locales";
import { setLanguagesAction } from "../actions";

export type LanguageRow = { locale: Locale; offered: boolean; done: number; total: number; stale: number; bannerAlt: string };

/** Which languages the quiz is offered in, how far each translation is, and the banner's alt text in each. */
export function LanguagesForm({ quizId, rows, hasBanner }: { quizId: number; rows: LanguageRow[]; hasBanner: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(setLanguagesAction.bind(null, quizId), {});
  return (
    <form action={action} className="flex flex-col gap-4 text-sm">
      <p className="max-w-2xl text-muted">
        English is always offered. Respondents get their browser&apos;s language when the quiz offers it, and can switch
        with a menu at the top of the quiz. Anything not yet translated shows in English. Translate the quiz in the
        builder&apos;s <Link href={`/admin/quizzes/${quizId}/builder/translations`} className="text-brand underline underline-offset-4">Translations</Link> tab.
      </p>
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.locale} className="flex flex-col gap-2 rounded-md border border-border p-3">
            <label className="flex items-center gap-2 font-medium">
              <input type="checkbox" name="languages" value={r.locale} defaultChecked={r.offered} aria-describedby={`lang-${r.locale}-status`} />
              Offer in {LOCALE_NAMES_EN[r.locale]} (<span lang={r.locale}>{LOCALES[r.locale]}</span>)
            </label>
            <p id={`lang-${r.locale}-status`} className="text-muted">
              {r.done} of {r.total} texts translated
              {r.stale > 0 && `, ${r.stale} need${r.stale === 1 ? "s" : ""} review (the English changed)`}.{" "}
              <Link href={`/admin/quizzes/${quizId}/builder/translations?lang=${r.locale}`} className="text-brand underline underline-offset-4">
                Translate<span className="sr-only"> into {LOCALE_NAMES_EN[r.locale]}</span>
              </Link>
            </p>
            {hasBanner && (
              <div className="flex flex-col gap-1">
                <label htmlFor={`alt-${r.locale}`}>Banner alt text in {LOCALE_NAMES_EN[r.locale]}</label>
                <input
                  id={`alt-${r.locale}`}
                  name={`bannerAlt.${r.locale}`}
                  lang={r.locale}
                  defaultValue={r.bannerAlt}
                  maxLength={300}
                  className="max-w-xl rounded-md border border-border bg-surface px-2 py-1.5"
                />
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-strong disabled:opacity-60">
          {pending ? "Saving…" : "Save languages"}
        </button>
        <p role="status" className={state.error ? "text-danger" : "text-brand"}>
          {state.error ?? state.message ?? ""}
        </p>
      </div>
    </form>
  );
}
