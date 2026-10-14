"use client";

import { useMemo, useState } from "react";
import { RichTextEditor } from "@/components/rich-text-editor";
import type { EditorField } from "@/lib/content/translations";
import { saveTranslationsAction } from "./actions";

type Field = EditorField & { draft: string };
type GroupState = { saving: boolean; message: string | null; error: string | null };

const plainInput = "w-full rounded-md border border-border bg-surface px-2 py-1.5";

/**
 * Each translatable text with its English beside it, grouped by quiz item and
 * saved per group (like the question cards). Empty means "show the English".
 */
export function TranslationsEditor({
  quizId,
  locale,
  languageName,
  initial,
}: {
  quizId: number;
  locale: string;
  languageName: string;
  initial: EditorField[];
}) {
  const [fields, setFields] = useState<Field[]>(() => initial.map((f) => ({ ...f, draft: f.translation })));
  const [groups, setGroups] = useState<Record<string, GroupState>>({});
  const [onlyTodo, setOnlyTodo] = useState(false);

  const grouped = useMemo(() => {
    const out = new Map<string, Field[]>();
    for (const f of fields) out.set(f.group, [...(out.get(f.group) ?? []), f]);
    return [...out.entries()];
  }, [fields]);
  const done = fields.filter((f) => f.translation).length;
  const stale = fields.filter((f) => f.stale).length;

  const edit = (key: string, draft: string) => setFields((fs) => fs.map((f) => (f.key === key ? { ...f, draft } : f)));

  async function save(group: string, items: Field[]) {
    const changed = items.filter((f) => f.draft !== f.translation || f.stale);
    setGroups((g) => ({ ...g, [group]: { saving: true, message: null, error: null } }));
    const res = await saveTranslationsAction(quizId, locale, changed.map((f) => ({ key: f.key, text: f.draft })), group);
    if (!res.ok) {
      setGroups((g) => ({ ...g, [group]: { saving: false, message: null, error: res.error ?? "Couldn't save these translations." } }));
      return;
    }
    // Keep unsaved edits in other groups; take the server's view of this one.
    const fresh = new Map(res.data.fields.map((f) => [f.key, f]));
    const mine = new Set(items.map((f) => f.key));
    setFields((fs) =>
      fs.map((f) => {
        const s = fresh.get(f.key);
        if (!s) return f;
        return mine.has(f.key) ? { ...s, draft: s.translation } : { ...s, draft: f.draft };
      }),
    );
    setGroups((g) => ({ ...g, [group]: { saving: false, message: res.data.message, error: null } }));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p role="status">
          {done} of {fields.length} texts translated into {languageName}
          {stale > 0 && `; ${stale} need${stale === 1 ? "s" : ""} review because the English changed`}.
        </p>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={onlyTodo} onChange={(e) => setOnlyTodo(e.target.checked)} />
          Only show texts that are missing or need review
        </label>
      </div>

      {grouped.map(([group, items]) => {
        const visible = onlyTodo ? items.filter((f) => !f.translation || f.stale) : items;
        if (visible.length === 0) return null;
        const state = groups[group];
        const dirty = items.some((f) => f.draft !== f.translation);
        const needsReview = items.some((f) => f.stale);
        const id = `tr-${group.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
        return (
          <section key={group} aria-labelledby={id} className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 id={id} className="font-semibold">
                {group}
              </h3>
              <span className="text-sm text-muted">
                {items.filter((f) => f.translation).length} of {items.length} translated
              </span>
            </div>
            {visible.map((f) => {
              const inputId = `${id}-${f.key.replace(/[^a-z0-9]+/gi, "-")}`;
              return (
                <div key={f.key} className="grid gap-3 md:grid-cols-2">
                  <div className="flex flex-col gap-1 text-sm">
                    <span className="font-medium">{f.label} (English)</span>
                    {f.rich ? (
                      <div className="rich-text rounded-md border border-dashed border-border bg-background px-3 py-2" dangerouslySetInnerHTML={{ __html: f.text }} />
                    ) : (
                      <p className="rounded-md border border-dashed border-border bg-background px-2 py-1.5">{f.text}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 text-sm" lang={locale}>
                    <label htmlFor={inputId} className="flex flex-wrap items-center gap-2 font-medium" lang="en">
                      {f.label} ({languageName})
                      {f.stale && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Needs review</span>
                      )}
                    </label>
                    {f.rich ? (
                      <RichTextEditor id={inputId} label={`${f.label} (${languageName})`} value={f.draft} onChange={(html) => edit(f.key, html)} quizId={quizId} />
                    ) : f.max > 300 ? (
                      <textarea id={inputId} value={f.draft} maxLength={f.max} rows={2} onChange={(e) => edit(f.key, e.target.value)} className={plainInput} />
                    ) : (
                      <input id={inputId} value={f.draft} maxLength={f.max} onChange={(e) => edit(f.key, e.target.value)} className={plainInput} />
                    )}
                  </div>
                </div>
              );
            })}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => save(group, items)}
                disabled={state?.saving || (!dirty && !needsReview)}
                className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-strong disabled:opacity-40"
              >
                {state?.saving ? "Saving…" : needsReview && !dirty ? "Mark as reviewed" : "Save translations"}
                <span className="sr-only"> for {group}</span>
              </button>
              <p role="status" className={`text-sm ${state?.error ? "text-danger" : "text-brand"}`}>
                {state?.error ?? state?.message ?? ""}
              </p>
            </div>
          </section>
        );
      })}
    </div>
  );
}
