"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/content/action-result";
import { deleteQuizAction, updateQuizAction } from "../actions";
import { QuizFields } from "../quiz-fields";

export function SettingsForm({ quizId, title, slug }: { quizId: number; title: string; slug: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    updateQuizAction.bind(null, quizId),
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-wrap gap-3">
        <QuizFields idPrefix="quiz" defaultTitle={title} defaultSlug={slug} errors={state.fieldErrors} />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-strong disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <p role="status" className={`text-sm ${state.error ? "text-danger" : "text-brand"}`}>
          {state.error ?? state.message ?? ""}
        </p>
      </div>
    </form>
  );
}

export function DeleteQuizForm({ quizId, title }: { quizId: number; title: string }) {
  const [state, action, pending] = useActionState<FormState>(deleteQuizAction.bind(null, quizId), {});

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(`Delete “${title}” and everything in it? This can't be undone.`)) {
          event.preventDefault();
        }
      }}
      className="flex flex-col gap-2"
    >
      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-danger px-4 py-2 font-medium text-danger hover:bg-danger/5 disabled:opacity-60"
        >
          {pending ? "Deleting…" : "Delete quiz"}
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
