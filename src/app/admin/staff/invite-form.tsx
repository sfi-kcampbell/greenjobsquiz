"use client";

import { useActionState, useEffect, useRef } from "react";
import { inviteAdmin, type InviteState } from "./actions";

export function InviteForm() {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteAdmin, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3" noValidate>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-60 flex-1 flex-col gap-1">
          <label htmlFor="invite-email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="invite-email"
            name="email"
            type="email"
            required
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? "invite-status" : undefined}
            className="rounded-md border border-border bg-surface px-3 py-2"
          />
        </div>
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <label htmlFor="invite-name" className="text-sm font-medium">
            Name <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id="invite-name"
            name="name"
            type="text"
            className="rounded-md border border-border bg-surface px-3 py-2"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-strong disabled:opacity-60"
        >
          {pending ? "Inviting…" : "Invite Admin"}
        </button>
      </div>
      <p
        id="invite-status"
        role="status"
        className={`min-h-5 text-sm ${state.error ? "text-danger" : "text-brand"}`}
      >
        {state.error ?? state.message ?? ""}
      </p>
    </form>
  );
}
