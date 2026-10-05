"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/content/action-result";
import { updateRespondentOptionsAction } from "../actions";

const OPTIONS = [
  { name: "showProgress", label: "Show a progress bar", hint: "Shows how many questions have been answered." },
  {
    name: "autoAdvance",
    label: "Move on after a single-choice answer",
    hint: "Goes to the next question as soon as someone picks an answer. The Next button is always shown too.",
  },
  {
    name: "retakeAllowed",
    label: "Allow retakes",
    hint: "Lets people start over after seeing their result. Earlier results are always kept.",
  },
] as const;

export function RespondentForm({
  quizId,
  values,
}: {
  quizId: number;
  values: { showProgress: boolean; autoAdvance: boolean; retakeAllowed: boolean };
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    updateRespondentOptionsAction.bind(null, quizId),
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-4 text-sm">
      {OPTIONS.map((o) => (
        <div key={o.name} className="flex flex-col gap-1">
          <label className="flex items-center gap-2 font-medium">
            <input type="checkbox" name={o.name} defaultChecked={values[o.name]} aria-describedby={`${o.name}-hint`} />
            {o.label}
          </label>
          <p id={`${o.name}-hint`} className="max-w-2xl text-muted">
            {o.hint}
          </p>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-strong disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save respondent options"}
        </button>
        <p role="status" className={state.error ? "text-danger" : "text-brand"}>
          {state.error ?? state.message ?? ""}
        </p>
      </div>
    </form>
  );
}
