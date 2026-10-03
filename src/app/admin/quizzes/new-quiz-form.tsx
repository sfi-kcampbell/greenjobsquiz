"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/content/action-result";
import { createQuizAction } from "./actions";
import { QuizFields } from "./quiz-fields";

export function NewQuizForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(createQuizAction, {});

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <div className="flex flex-wrap items-start gap-3">
        <QuizFields idPrefix="new-quiz" errors={state.fieldErrors} />
        <button
          type="submit"
          disabled={pending}
          className="mt-6 rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-strong disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create quiz"}
        </button>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}
