"use client";

import { useId } from "react";
import { LOCALES, type Locale } from "@/lib/i18n/locales";
import { useMessages } from "./i18n";

/** Shown when a quiz offers more than one language. Each language is named in itself. */
export function LanguageSwitcher({ locale, languages, onChange }: { locale: Locale; languages: Locale[]; onChange: (locale: Locale) => void }) {
  const id = useId();
  const m = useMessages();
  return (
    <div className="pltq-language no-print flex items-center justify-end gap-2 text-sm">
      <label htmlFor={id} className="text-muted">
        {m.language}
      </label>
      <select
        id={id}
        value={locale}
        onChange={(e) => onChange(e.target.value as Locale)}
        className="rounded-md border border-border bg-surface px-2 py-1"
      >
        {languages.map((l) => (
          <option key={l} value={l} lang={l}>
            {LOCALES[l]}
          </option>
        ))}
      </select>
    </div>
  );
}
