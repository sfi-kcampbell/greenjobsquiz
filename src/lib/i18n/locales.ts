/**
 * Languages respondents can use. English is the source language: quiz
 * content is written in it and translated by admins. Adding a language means
 * a messages file (./messages) plus an entry here.
 */
export const LOCALES = {
  en: "English",
  es: "Español",
  fr: "Français",
} as const;

export type Locale = keyof typeof LOCALES;
export const DEFAULT_LOCALE: Locale = "en";
/** Languages a quiz can offer besides English. */
export const EXTRA_LOCALES = (Object.keys(LOCALES) as Locale[]).filter((l) => l !== DEFAULT_LOCALE);
/** Admin-facing names ("Spanish"), for the settings and Translations screens. */
export const LOCALE_NAMES_EN: Record<Locale, string> = { en: "English", es: "Spanish", fr: "French" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && Object.hasOwn(LOCALES, value);
}

/** The languages a quiz offers, English first (unknown codes are dropped). */
export function offeredLocales(languages: readonly string[] | null | undefined): Locale[] {
  return [DEFAULT_LOCALE, ...EXTRA_LOCALES.filter((l) => languages?.includes(l))];
}

/** Locales from an Accept-Language header, best first ("es-MX,es;q=0.9,en;q=0.8" → es, es, en). */
function fromAcceptLanguage(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(",")
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      return { lang: tag.trim().toLowerCase().split("-")[0], q: q ? Number(q.slice(2)) || 0 : 1, i };
    })
    .filter((x) => x.lang && x.lang !== "*" && x.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i)
    .map((x) => x.lang);
}

/**
 * The language to show: the one asked for (?lang=) if offered, else the
 * browser's best offered language, else English.
 */
export function pickLocale(requested: unknown, acceptLanguage: string | null | undefined, offered: readonly Locale[]): Locale {
  const req = typeof requested === "string" ? requested.toLowerCase() : null;
  if (req && isLocale(req) && offered.includes(req)) return req;
  for (const lang of fromAcceptLanguage(acceptLanguage)) if (isLocale(lang) && offered.includes(lang)) return lang;
  return DEFAULT_LOCALE;
}
