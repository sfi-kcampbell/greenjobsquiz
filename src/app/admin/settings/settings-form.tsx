"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/content/action-result";
import { updateAccessSettingsAction } from "./actions";

function OriginList({ name, label, hint, value, error }: { name: string; label: string; hint: string; value: string[]; error?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="font-medium">
        {label}
      </label>
      <p id={`${name}-hint`} className="max-w-2xl text-muted">
        {hint}
      </p>
      <textarea
        id={name}
        name={name}
        rows={4}
        defaultValue={value.join("\n")}
        placeholder="https://www.example.org"
        aria-describedby={`${name}-hint${error ? ` ${name}-error` : ""}`}
        aria-invalid={error ? true : undefined}
        className="max-w-xl rounded-md border border-border bg-surface px-2 py-1.5 font-mono text-sm"
      />
      {error && (
        <p id={`${name}-error`} className="text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function AccessSettingsForm({ embedOrigins, corsOrigins }: { embedOrigins: string[]; corsOrigins: string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateAccessSettingsAction, {});
  return (
    <form action={action} className="flex flex-col gap-5 text-sm">
      <OriginList
        name="embedOrigins"
        label="Sites allowed to embed quizzes"
        hint="One site address per line, like https://www.example.org. Leave empty to allow any site."
        value={embedOrigins}
        error={state.fieldErrors?.embedOrigins}
      />
      <OriginList
        name="corsOrigins"
        label="Sites allowed to call the quiz API from the browser"
        hint="For headless front ends on another domain. Embeds don't need this. One site address per line."
        value={corsOrigins}
        error={state.fieldErrors?.corsOrigins}
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-strong disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <p role="status" className={state.error ? "text-danger" : "text-brand"}>
          {state.error ?? state.message ?? ""}
        </p>
      </div>
    </form>
  );
}
