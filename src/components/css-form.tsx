"use client";

import { useActionState } from "react";
import { CssEditor } from "@/components/css-editor";
import type { FormState } from "@/lib/content/action-result";

/** Saves CSS through `action` (quiz or site-wide). */
export function CssForm({
  id,
  label,
  action: save,
  css,
  hint,
  previewUrl,
  submitLabel,
}: {
  id: string;
  label: string;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  css: string;
  hint: string;
  previewUrl: string | null;
  submitLabel: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(save, {});
  return (
    <form action={action} className="flex flex-col gap-3 text-sm">
      <p id={`${id}-hint`} className="max-w-2xl text-muted">
        {hint}
      </p>
      <CssEditor id={id} name="css" label={label} defaultValue={css} error={state.fieldErrors?.css} describedBy={`${id}-hint`} />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-strong disabled:opacity-60"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        {previewUrl && (
          <a href={previewUrl} target="_blank" rel="noopener" className="text-brand underline underline-offset-4">
            Preview quiz (opens in a new tab)
          </a>
        )}
        <p role="status" className={state.error ? "text-danger" : "text-brand"}>
          {state.error ?? state.message ?? ""}
        </p>
      </div>
    </form>
  );
}
