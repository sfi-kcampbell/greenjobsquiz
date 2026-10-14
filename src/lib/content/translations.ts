/**
 * Admins' translations of a quiz (the working copy; published with versions).
 * English is the source. Each row remembers a hash of the English it was
 * translated from, so the editor can say when the English has changed since.
 */
import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database, Executor } from "@/lib/db/create";
import { quizzes, translations } from "@/lib/db/schema";
import { DEFAULT_LOCALE, EXTRA_LOCALES, isLocale } from "@/lib/i18n/locales";
import { sanitizeRichText } from "@/lib/sanitize/rich-text";
import { ContentError } from "./errors";
import { sourceFields, type SourceField, type Translations } from "./localize";
import { lockQuiz } from "./quizzes";
import type { QuizContent } from "./versions";

export const hashText = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

/** Translations for content's current fields (rows for deleted items or emptied English are left out). */
export async function readTranslations(db: Executor, quizId: number, content: QuizContent): Promise<Translations> {
  const rows = await db
    .select({ locale: translations.locale, key: translations.key, text: translations.text })
    .from(translations)
    .where(eq(translations.quizId, quizId));
  if (!rows.length) return {};
  const keys = new Set(sourceFields(content).map((f) => f.key));
  const out: Translations = {};
  for (const r of rows) {
    if (!keys.has(r.key) || !r.text.trim() || !isLocale(r.locale)) continue;
    (out[r.locale] ??= {})[r.key] = r.text;
  }
  return out;
}

export type EditorField = SourceField & {
  translation: string;
  /** Translated, but the English has changed since. */
  stale: boolean;
};

/** Every translatable field with its translation in `locale` (for the Translations tab). */
export async function translationEditor(db: Executor, quizId: number, locale: string, content: QuizContent): Promise<EditorField[]> {
  const rows = await db
    .select({ key: translations.key, text: translations.text, sourceHash: translations.sourceHash })
    .from(translations)
    .where(and(eq(translations.quizId, quizId), eq(translations.locale, locale)));
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return sourceFields(content).map((f) => {
    const row = byKey.get(f.key);
    return { ...f, translation: row?.text ?? "", stale: Boolean(row?.text && row.sourceHash !== hashText(f.text)) };
  });
}

/**
 * Saves translations for some fields. An empty text removes the translation
 * (the field shows in English). Unknown keys are refused; rich text is
 * sanitized like the English.
 */
export async function saveTranslations(
  db: Database,
  quizId: number,
  locale: string,
  entries: { key: string; text: string }[],
  content: QuizContent,
): Promise<{ saved: number; cleared: number }> {
  if (!isLocale(locale) || locale === DEFAULT_LOCALE) throw new ContentError("invalid", "That language isn't available.");
  const fields = new Map(sourceFields(content).map((f) => [f.key, f]));
  const upserts: { key: string; text: string; sourceHash: string }[] = [];
  const clears: string[] = [];
  for (const e of entries) {
    const f = fields.get(e.key);
    if (!f) throw new ContentError("invalid", "Some fields no longer exist. Reload the page and try again.");
    const text = f.rich ? sanitizeRichText(e.text.trim()) ?? "" : e.text.replace(/\s+/g, " ").trim();
    if (text.length > f.max) throw new ContentError("invalid", `${f.group} → ${f.label}: keep it under ${f.max.toLocaleString("en")} characters.`);
    if (text) upserts.push({ key: e.key, text, sourceHash: hashText(f.text) });
    else clears.push(e.key);
  }
  await db.transaction(async (tx) => {
    await lockQuiz(tx, quizId);
    if (clears.length) {
      await tx.delete(translations).where(and(eq(translations.quizId, quizId), eq(translations.locale, locale), inArray(translations.key, clears)));
    }
    for (const u of upserts) {
      await tx
        .insert(translations)
        .values({ quizId, locale, ...u })
        .onConflictDoUpdate({
          target: [translations.quizId, translations.locale, translations.key],
          set: { text: u.text, sourceHash: u.sourceHash, updatedAt: new Date() },
        });
    }
  });
  return { saved: upserts.length, cleared: clears.length };
}

/** Makes the working translations match `content` (restore, import). Marked as up to date with its English. */
export async function replaceTranslations(db: Executor, quizId: number, content: QuizContent): Promise<void> {
  await db.delete(translations).where(eq(translations.quizId, quizId));
  const fields = new Map(sourceFields(content).map((f) => [f.key, f]));
  const rows = Object.entries(content.translations ?? {}).flatMap(([locale, map]) =>
    isLocale(locale)
      ? Object.entries(map)
          .filter(([key, text]) => fields.has(key) && text.trim())
          .map(([key, text]) => ({ quizId, locale, key, text, sourceHash: hashText(fields.get(key)!.text) }))
      : [],
  );
  if (rows.length) await db.insert(translations).values(rows);
}

/**
 * Which languages a quiz offers besides English, and the banner's alt text in
 * each. Live straight away (like delivery settings); content translations
 * still need publishing.
 */
export async function setQuizLanguages(db: Executor, quizId: number, languages: string[], bannerAlt: Record<string, string>): Promise<string[]> {
  const offered = EXTRA_LOCALES.filter((l) => languages.includes(l));
  const alts = Object.fromEntries(
    Object.entries(bannerAlt)
      .filter(([l, t]) => isLocale(l) && l !== DEFAULT_LOCALE && t.trim())
      .map(([l, t]) => [l, t.replace(/\s+/g, " ").trim().slice(0, 300)]),
  );
  await db
    .update(quizzes)
    .set({ languages: offered, bannerAltTranslations: alts, structureVersion: sql`${quizzes.structureVersion} + 1`, updatedAt: new Date() })
    .where(eq(quizzes.id, quizId));
  return offered;
}

/** Per language: how many of the draft's texts are translated, and how many need review. */
export async function translationStatus(
  db: Executor,
  quizId: number,
  content: QuizContent,
): Promise<Record<string, { done: number; total: number; stale: number }>> {
  const fields = sourceFields(content);
  const rows = await db.select().from(translations).where(eq(translations.quizId, quizId));
  return Object.fromEntries(
    EXTRA_LOCALES.map((locale) => {
      const mine = new Map(rows.filter((r) => r.locale === locale).map((r) => [r.key, r]));
      let done = 0;
      let stale = 0;
      for (const f of fields) {
        const row = mine.get(f.key);
        if (!row?.text) continue;
        done++;
        if (row.sourceHash !== hashText(f.text)) stale++;
      }
      return [locale, { done, total: fields.length, stale }];
    }),
  );
}
