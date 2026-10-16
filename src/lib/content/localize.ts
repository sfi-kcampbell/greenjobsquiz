/**
 * What can be translated in a quiz, and putting translations on top of the
 * English content. Pure (no database), so the public structure, the result
 * page, the admin editor and tests share it.
 *
 * A translation's key is "kind:id:field", e.g. "question:12:title"; the quiz
 * itself is "quiz:0:title". Anything without a translation stays English.
 */
import type { QuizContent } from "./versions";

export type TranslationKind = "quiz" | "category" | "question" | "answer" | "response";
/** locale → key → text. */
export type Translations = Record<string, Record<string, string>>;

export type SourceField = {
  key: string;
  kind: TranslationKind;
  /** Which item it belongs to, for grouping in the editor ("Question 3", "Answer: Hike"). */
  group: string;
  field: string;
  /** Admin-facing field name ("Title", "Help text"). */
  label: string;
  text: string;
  rich: boolean;
  /** Longest translation allowed (rich text: HTML length). */
  max: number;
};

export const translationKey = (kind: TranslationKind, id: number, field: string) => `${kind}:${id}:${field}`;

/** Every translatable English text in the content, in the order an admin reads the quiz. */
export function sourceFields(content: QuizContent): SourceField[] {
  const out: SourceField[] = [];
  const add = (kind: TranslationKind, id: number, group: string, field: string, label: string, text: string | null, rich: boolean, max: number) => {
    if (text && text.trim()) out.push({ key: translationKey(kind, id, field), kind, group, field, label, text, rich, max });
  };
  add("quiz", 0, "Quiz", "title", "Title", content.title, false, 200);
  add("quiz", 0, "Quiz", "introHtml", "Introduction", content.introHtml, true, 20_000);
  for (const c of content.categories) add("category", c.id, `Category: ${c.name}`, "name", "Name", c.name, false, 80);
  content.questions.forEach((q, i) => {
    const group = `Question ${i + 1}`;
    add("question", q.id, group, "title", "Question", q.title, false, 500);
    add("question", q.id, group, "helpHtml", "Help text", q.helpHtml, true, 10_000);
    for (const a of q.answers) {
      add("answer", a.id, group, "label", `Answer “${a.label}”`, a.label, false, 300);
      add("answer", a.id, group, "bodyHtml", `Details for “${a.label}”`, a.bodyHtml, true, 10_000);
    }
  });
  for (const r of content.responses) {
    const group = `Response: ${r.title}`;
    add("response", r.id, group, "title", "Title", r.title, false, 200);
    add("response", r.id, group, "excerpt", "Short summary", r.excerpt, false, 500);
    add("response", r.id, group, "bodyHtml", "Description", r.bodyHtml, true, 50_000);
    add("response", r.id, group, "ctaLabel", "Button label", r.ctaLabel, false, 60);
  }
  return out;
}

/**
 * The content in `locale`: each translated field replaced, the rest left in
 * English. Ids, order, weights and settings are untouched, so scoring and
 * saved answers are the same in every language.
 */
export function localizeContent(content: QuizContent, locale: string | null | undefined): QuizContent {
  const t = locale ? content.translations?.[locale] : undefined;
  if (!t || Object.keys(t).length === 0) return content;
  function tr(kind: TranslationKind, id: number, field: string, text: string): string;
  function tr(kind: TranslationKind, id: number, field: string, text: string | null): string | null;
  function tr(kind: TranslationKind, id: number, field: string, text: string | null) {
    return (text && t![translationKey(kind, id, field)]) || text;
  }
  return {
    ...content,
    title: tr("quiz", 0, "title", content.title),
    introHtml: tr("quiz", 0, "introHtml", content.introHtml),
    categories: content.categories.map((c) => ({ ...c, name: tr("category", c.id, "name", c.name) })),
    questions: content.questions.map((q) => ({
      ...q,
      title: tr("question", q.id, "title", q.title),
      helpHtml: tr("question", q.id, "helpHtml", q.helpHtml),
      answers: q.answers.map((a) => ({
        ...a,
        label: tr("answer", a.id, "label", a.label),
        bodyHtml: tr("answer", a.id, "bodyHtml", a.bodyHtml),
      })),
    })),
    responses: content.responses.map((r) => ({
      ...r,
      title: tr("response", r.id, "title", r.title),
      excerpt: tr("response", r.id, "excerpt", r.excerpt),
      bodyHtml: tr("response", r.id, "bodyHtml", r.bodyHtml),
      ctaLabel: tr("response", r.id, "ctaLabel", r.ctaLabel),
    })),
  };
}

/** How many of the content's translatable fields have a translation in `locale`. */
export function translationProgress(content: QuizContent, locale: string): { done: number; total: number } {
  const fields = sourceFields(content);
  const t = content.translations?.[locale] ?? {};
  return { done: fields.filter((f) => t[f.key]).length, total: fields.length };
}
