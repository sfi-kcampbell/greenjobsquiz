"use client";

import { useTransition } from "react";
import { deleteSubmissionAndReturn, revokeShareLinkAction } from "../actions";

export function RevokeShareButton({ id }: { id: number }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Turn off this result's share link? Anyone who has it will see “link isn't valid”. This can't be undone.")) return;
        start(() => revokeShareLinkAction(id));
      }}
      className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-border/40 disabled:opacity-60"
    >
      {pending ? "Turning off…" : "Turn off share link"}
    </button>
  );
}

export function DeleteSubmissionButton({ id, back }: { id: number; back: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Delete this submission? This can't be undone.")) return;
        start(() => deleteSubmissionAndReturn(id, back));
      }}
      className="rounded-md border border-danger px-3 py-1.5 font-medium text-danger hover:bg-danger/5 disabled:opacity-60"
    >
      {pending ? "Deleting…" : "Delete submission"}
    </button>
  );
}
