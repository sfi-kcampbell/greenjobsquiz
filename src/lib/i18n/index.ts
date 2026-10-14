/**
 * Respondent-facing text by language. Plain data and functions, so it works
 * in server components, client components and pure modules alike.
 */
import { DEFAULT_LOCALE, isLocale, type Locale } from "./locales";
import { en, type Messages } from "./messages/en";
import { es } from "./messages/es";
import { fr } from "./messages/fr";

export type { Messages };

const CATALOGS: Record<Locale, Messages> = { en, es, fr };

export function messagesFor(locale: string | null | undefined): Messages {
  return CATALOGS[isLocale(locale) ? locale : DEFAULT_LOCALE];
}

/** A long date ("March 4, 2026", "4 de marzo de 2026") in the respondent's language. */
export function longDate(locale: string | null | undefined, date: Date | string, opts: { utc?: boolean } = {}): string {
  return new Date(date).toLocaleDateString(isLocale(locale) ? locale : DEFAULT_LOCALE, {
    dateStyle: "long",
    ...(opts.utc ? { timeZone: "UTC" } : {}),
  });
}
