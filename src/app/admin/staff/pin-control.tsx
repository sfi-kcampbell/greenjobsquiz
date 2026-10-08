"use client";

import { useActionState, useState } from "react";
import { createAdminPin, type PinState } from "./actions";

/** Create, reset or revoke one Admin's sign-in PIN; a new PIN is shown once. */
export function PinControl({ id, email, hasPin }: { id: number; email: string; hasPin: boolean }) {
  const [state, action, pending] = useActionState<PinState, FormData>(createAdminPin.bind(null, id), {});
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col items-start gap-2">
      <form action={action} className="flex flex-wrap gap-3">
        <button
          type="submit"
          name="intent"
          value="create"
          disabled={pending}
          onClick={(e) => {
            if (hasPin && !window.confirm(`Reset ${email}'s PIN? Their current PIN stops working and they're signed out.`)) e.preventDefault();
            setCopied(false);
          }}
          aria-label={`${hasPin ? "Reset" : "Create"} PIN for ${email}`}
          className="text-brand underline underline-offset-4 disabled:opacity-60"
        >
          {hasPin ? "Reset PIN" : "Create PIN"}
        </button>
        {hasPin && (
          <button
            type="submit"
            name="intent"
            value="revoke"
            disabled={pending}
            onClick={(e) => {
              if (!window.confirm(`Revoke ${email}'s PIN? They're signed out and can't sign in with a PIN until you create a new one.`)) e.preventDefault();
            }}
            aria-label={`Revoke PIN for ${email}`}
            className="text-danger underline underline-offset-4 disabled:opacity-60"
          >
            Revoke PIN
          </button>
        )}
      </form>
      <div role="status" className="text-sm">
        {state.error && <p className="text-danger">{state.error}</p>}
        {state.revoked && <p className="text-muted">PIN revoked.</p>}
        {state.pin && (
          <div className="flex flex-col gap-1 rounded-md border border-brand/40 bg-brand/5 p-2">
            <p>
              Give this PIN to {state.email}. It won&apos;t be shown again:
            </p>
            <div className="flex items-center gap-2">
              <code className="rounded bg-surface px-2 py-1 font-mono text-base tracking-wider" data-testid="new-pin">
                {state.pin}
              </code>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(state.pin!);
                    setCopied(true);
                  } catch {
                    setCopied(false);
                  }
                }}
                className="rounded-md border border-border px-2 py-1 hover:bg-border/40"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
