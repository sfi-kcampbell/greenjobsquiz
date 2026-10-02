"use client";

import { useActionState } from "react";
import { requestSignInLink, type SignInState } from "./actions";

export function SignInForm({ defaultEmail }: { defaultEmail?: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(requestSignInLink, {});

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="font-medium">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.email ?? defaultEmail}
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "email-error" : undefined}
          className="rounded-md border border-border bg-surface px-3 py-2"
        />
        {state.error && (
          <p id="email-error" role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-strong disabled:opacity-60"
      >
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
