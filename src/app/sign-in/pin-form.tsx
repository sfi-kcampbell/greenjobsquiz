"use client";

import { useActionState } from "react";
import { signInWithPin, type PinSignInState } from "./actions";

export function PinForm() {
  const [state, action, pending] = useActionState<PinSignInState, FormData>(signInWithPin, {});

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor="pin-email" className="font-medium">
          Email address
        </label>
        <input
          id="pin-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.email}
          className="rounded-md border border-border bg-surface px-3 py-2"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="pin" className="font-medium">
          PIN
        </label>
        <input
          id="pin"
          name="pin"
          type="password"
          autoComplete="off"
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "pin-error" : undefined}
          className="rounded-md border border-border bg-surface px-3 py-2"
        />
        {state.error && (
          <p id="pin-error" role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-brand px-4 py-2 font-medium text-brand hover:bg-brand/5 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in with PIN"}
      </button>
    </form>
  );
}
