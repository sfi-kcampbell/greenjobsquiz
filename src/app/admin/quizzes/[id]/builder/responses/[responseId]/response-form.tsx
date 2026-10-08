"use client";

import { useState } from "react";
import { useUnsavedChangesWarning } from "@/components/builder/hooks";
import { cellValue, formatWeight, WeightCell, type CategoryHeader } from "@/components/builder/weight-matrix";
import { TextField } from "@/components/form-field";
import { RichTextEditor } from "@/components/rich-text-editor";
import type { ResponseView } from "@/lib/content/responses";
import { WEIGHT_MAX } from "@/lib/content/validation";
import { normalizeToSum } from "@/lib/scoring/vector";
import { updateResponseDetailsAction } from "../actions";

type Form = {
  title: string;
  excerpt: string;
  bodyHtml: string | null;
  ctaUrl: string;
  ctaLabel: string;
  cells: Record<number, string>;
};

function fromView(r: ResponseView): Form {
  const cells: Record<number, string> = {};
  for (const [id, w] of Object.entries(r.weights)) cells[Number(id)] = String(w);
  return {
    title: r.title,
    excerpt: r.excerpt ?? "",
    bodyHtml: r.bodyHtml || null,
    ctaUrl: r.ctaUrl ?? "",
    ctaLabel: r.ctaLabel ?? "",
    cells,
  };
}

export function ResponseForm({
  quizId,
  response,
  categories,
}: {
  quizId: number;
  response: ResponseView;
  categories: CategoryHeader[];
}) {
  const [form, setForm] = useState<Form>(() => fromView(response));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);

  useUnsavedChangesWarning(dirty);

  function update(changes: Partial<Form>) {
    setForm((f) => ({ ...f, ...changes }));
    setDirty(true);
    setStatus(null);
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(changes)) delete next[k];
      delete next.form;
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    const result = await updateResponseDetailsAction(quizId, response.id, {
      title: form.title,
      excerpt: form.excerpt,
      bodyHtml: form.bodyHtml,
      ctaUrl: form.ctaUrl,
      ctaLabel: form.ctaLabel,
      weights: Object.fromEntries(categories.map((c) => [String(c.id), cellValue(form.cells[c.id])])),
    });
    setSaving(false);
    if (!result.ok) {
      setErrors(result.fieldErrors ?? { form: result.error ?? "Couldn't save this response." });
      return;
    }
    setErrors({});
    setDirty(false);
    setStatus("Saved.");
  }

  function normalize() {
    const vector = Object.fromEntries(
      categories.map((c) => [c.id, cellValue(form.cells[c.id])]).filter(([, w]) => w !== 0),
    );
    const { weights, clamped } = normalizeToSum(vector);
    const cells: Record<number, string> = {};
    for (const [id, w] of Object.entries(weights)) cells[Number(id)] = formatWeight(w);
    update({ cells });
    if (clamped) setStatus("Some weights were held at ±5, so the total is below 10.");
  }

  const hasWeights = categories.some((c) => cellValue(form.cells[c.id]) !== 0);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="flex flex-col gap-6"
      noValidate
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* Content */}
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
          <TextField
            id="resp-title"
            label="Title"
            value={form.title}
            maxLength={120}
            error={errors.title}
            onChange={(e) => update({ title: e.target.value })}
          />
          <div className="flex flex-col gap-1">
            <label htmlFor="resp-excerpt" className="text-sm font-medium">
              Summary <span className="font-normal text-muted">(shown for runners-up)</span>
            </label>
            <textarea
              id="resp-excerpt"
              value={form.excerpt}
              maxLength={300}
              rows={3}
              aria-describedby="resp-excerpt-count"
              onChange={(e) => update({ excerpt: e.target.value })}
              className="rounded-md border border-border bg-surface px-3 py-2"
            />
            <p id="resp-excerpt-count" className="text-xs text-muted">
              {form.excerpt.length} / 300
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <span id="resp-body-label" className="text-sm font-medium">
              Description
            </span>
            <RichTextEditor
              id="resp-body"
              label="Description"
              quizId={quizId}
              value={form.bodyHtml}
              onChange={(html) => update({ bodyHtml: html })}
            />
          </div>
          <fieldset className="flex flex-wrap gap-3">
            <legend className="mb-1 text-sm font-medium">Call to action (optional)</legend>
            <TextField
              id="resp-cta-url"
              label="Link"
              type="url"
              placeholder="https://"
              value={form.ctaUrl}
              error={errors.ctaUrl}
              onChange={(e) => update({ ctaUrl: e.target.value })}
              className="min-w-60 flex-[2]"
            />
            <TextField
              id="resp-cta-label"
              label="Button label"
              placeholder="Learn more"
              maxLength={60}
              value={form.ctaLabel}
              error={errors.ctaLabel}
              onChange={(e) => update({ ctaLabel: e.target.value })}
              className="min-w-40 flex-1"
            />
          </fieldset>
        </div>

        {/* Category profile */}
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-semibold">Category profile</h3>
            <button
              type="button"
              onClick={normalize}
              disabled={!hasWeights}
              className="text-sm text-brand underline underline-offset-4 disabled:text-muted disabled:no-underline"
            >
              Normalize to 10
            </button>
          </div>
          <p className="text-xs text-muted">−5 strongly against · 0 neutral · +5 strongly for</p>
          <ul className="flex flex-col gap-2">
            {categories.map((c, i) => {
              const w = cellValue(form.cells[c.id]);
              const width = `${(Math.min(Math.abs(w), WEIGHT_MAX) / WEIGHT_MAX) * 50}%`;
              return (
                <li key={c.id} className="grid grid-cols-[minmax(7rem,11rem)_3.5rem_1fr] items-center gap-2 text-sm">
                  <span className="flex items-center gap-2 truncate" title={c.name}>
                    <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                    {c.name}
                  </span>
                  <WeightCell
                    matrix="profile"
                    row={i}
                    col={0}
                    text={form.cells[c.id] ?? ""}
                    label={`${c.name} weight`}
                    onText={(text) => update({ cells: { ...form.cells, [c.id]: text } })}
                  />
                  <div aria-hidden className="relative h-4 rounded bg-background" data-testid={`bar-${c.id}`}>
                    <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
                    <div
                      className="absolute inset-y-0.5 rounded-sm"
                      style={{
                        backgroundColor: c.color,
                        width,
                        ...(w >= 0 ? { left: "50%" } : { right: "50%" }),
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          {!hasWeights && (
            <p className="text-sm text-danger">With no weights, this response can never be recommended.</p>
          )}
        </div>
      </div>

      {errors.form && (
        <p role="alert" className="text-sm text-danger">
          {errors.form}
        </p>
      )}

      <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-end gap-3 rounded-lg border border-border bg-surface p-3 shadow-md">
        <p role="status" className="mr-auto text-sm text-muted">
          {status ?? (dirty ? "Unsaved changes" : "")}
        </p>
        <button
          type="submit"
          disabled={!dirty || saving}
          className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-strong disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save response"}
        </button>
      </div>
    </form>
  );
}
