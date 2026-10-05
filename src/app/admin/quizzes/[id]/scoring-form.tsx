"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/content/action-result";
import { updateScoringAction } from "../actions";

export function ScoringForm({
  quizId,
  runnersUpCount,
  normalizePerCategory,
  defaultResultId,
  responses,
}: {
  quizId: number;
  runnersUpCount: number;
  normalizePerCategory: boolean;
  defaultResultId: number | null;
  responses: { id: number; title: string }[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateScoringAction.bind(null, quizId), {});

  return (
    <form action={action} className="flex flex-col gap-4 text-sm">
      <div className="flex flex-col gap-1">
        <label htmlFor="runnersUpCount" className="font-medium">
          Runners-up shown with the result
        </label>
        <select
          id="runnersUpCount"
          name="runnersUpCount"
          defaultValue={runnersUpCount}
          className="w-24 rounded-md border border-border bg-surface px-2 py-1.5"
        >
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        {state.fieldErrors?.runnersUpCount && <p className="text-danger">{state.fieldErrors.runnersUpCount}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-2 font-medium">
          <input type="checkbox" name="normalizePerCategory" defaultChecked={normalizePerCategory} />
          Balance categories
        </label>
        <p className="max-w-2xl text-muted">
          Judges each category against the most it can score in this quiz. Without it, a category that more
          answers feed into (say Outdoors) can dominate results no matter what people pick. Leave this on unless
          you have a reason not to.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="defaultResultId" className="font-medium">
          Fallback response
        </label>
        <select
          id="defaultResultId"
          name="defaultResultId"
          defaultValue={defaultResultId ?? ""}
          aria-describedby="defaultResultId-hint"
          className="max-w-sm rounded-md border border-border bg-surface px-2 py-1.5"
        >
          <option value="">None: say we couldn&apos;t determine a match</option>
          {responses.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
        <p id="defaultResultId-hint" className="text-muted">
          Shown only when someone&apos;s answers carry no signal at all (for example, they skipped everything).
        </p>
        {state.fieldErrors?.defaultResultId && <p className="text-danger">{state.fieldErrors.defaultResultId}</p>}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-strong disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save scoring settings"}
        </button>
        <p role="status" className={state.error ? "text-danger" : "text-brand"}>
          {state.error ?? state.message ?? ""}
        </p>
      </div>
    </form>
  );
}
