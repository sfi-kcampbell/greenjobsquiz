"use client";

import { useActionState, useState, useTransition } from "react";
import type { FormState } from "@/lib/content/action-result";
import { archiveCodeAction, createCodeAction, resetReportLinkAction, setRequireCodeAction, updateCodeAction } from "../actions";

export type CodeView = {
  id: number;
  code: string;
  label: string | null;
  opensOn: string;
  closesOn: string;
  status: "open" | "scheduled" | "closed" | "archived";
  started: number;
  finished: number;
  reportToken: string;
};

const STATUS: Record<CodeView["status"], { label: string; className: string }> = {
  open: { label: "Open", className: "text-brand" },
  scheduled: { label: "Scheduled", className: "text-muted" },
  closed: { label: "Closed", className: "text-danger" },
  archived: { label: "Archived", className: "text-muted" },
};

const field = "rounded-md border border-border bg-surface px-2 py-1.5";

function DateFields({ prefix, values, errors }: { prefix: string; values?: { opensOn: string; closesOn: string }; errors?: Record<string, string> }) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${prefix}-opens`} className="font-medium">
          Opens (UTC, optional)
        </label>
        <input id={`${prefix}-opens`} name="opensOn" type="date" defaultValue={values?.opensOn} className={field} />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${prefix}-closes`} className="font-medium">
          Closes after (UTC, optional)
        </label>
        <input
          id={`${prefix}-closes`}
          name="closesOn"
          type="date"
          defaultValue={values?.closesOn}
          aria-invalid={errors?.closesOn ? true : undefined}
          aria-describedby={errors?.closesOn ? `${prefix}-closes-error` : undefined}
          className={field}
        />
        {errors?.closesOn && (
          <p id={`${prefix}-closes-error`} className="text-danger">
            {errors.closesOn}
          </p>
        )}
      </div>
    </>
  );
}

function RequireCodeForm({ quizId, requireCode }: { quizId: number; requireCode: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(setRequireCodeAction.bind(null, quizId), {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <label className="flex items-center gap-2 font-medium">
        <input type="checkbox" name="requireCode" defaultChecked={requireCode} aria-describedby="require-code-hint" />
        Require a quiz code to start
      </label>
      <p id="require-code-hint" className="text-muted">
        Only people with a code can start. People already partway through can finish.
      </p>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-border/40 disabled:opacity-60">
          {pending ? "Saving…" : "Save code setting"}
        </button>
        <p role="status" className="text-brand">
          {state.message ?? ""}
        </p>
      </div>
    </form>
  );
}

function CreateCodeForm({ quizId, suggestion }: { quizId: number; suggestion: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createCodeAction.bind(null, quizId), {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="new-code" className="font-medium">
          Code
        </label>
        <input
          id="new-code"
          name="code"
          defaultValue={suggestion}
          key={suggestion}
          maxLength={20}
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={state.fieldErrors?.code ? true : undefined}
          aria-describedby={`new-code-hint${state.fieldErrors?.code ? " new-code-error" : ""}`}
          className={`${field} w-40 font-mono uppercase`}
        />
        <p id="new-code-hint" className="text-muted">
          4–20 letters and numbers
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="new-code-label" className="font-medium">
          Label (optional)
        </label>
        <input id="new-code-label" name="label" maxLength={120} placeholder="Spring mailer" className={`${field} w-56`} />
        <p className="text-muted">&nbsp;</p>
      </div>
      <DateFields prefix="new-code" errors={state.fieldErrors} />
      <button type="submit" disabled={pending} className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-strong disabled:opacity-60">
        {pending ? "Creating…" : "Create code"}
      </button>
      <div className="basis-full">
        {state.fieldErrors?.code && (
          <p id="new-code-error" className="text-danger">
            {state.fieldErrors.code}
          </p>
        )}
        <p role="status" className={state.error ? "text-danger" : "text-brand"}>
          {state.error ?? state.message ?? ""}
        </p>
      </div>
    </form>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
      className="text-brand underline underline-offset-4"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function EditCodeForm({ quizId, code }: { quizId: number; code: CodeView }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateCodeAction.bind(null, quizId, code.id), {});
  const prefix = `edit-${code.id}`;
  return (
    <form action={action} className="mt-2 flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={`${prefix}-label`} className="font-medium">
          Label
        </label>
        <input id={`${prefix}-label`} name="label" defaultValue={code.label ?? ""} maxLength={120} className={`${field} w-56`} />
      </div>
      <DateFields prefix={prefix} values={code} errors={state.fieldErrors} />
      <button type="submit" disabled={pending} className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-border/40 disabled:opacity-60">
        {pending ? "Saving…" : "Save"}
      </button>
      <p role="status" className={state.error ? "text-danger" : "text-brand"}>
        {state.error ?? state.message ?? ""}
      </p>
    </form>
  );
}

function CodeRowView({ quizId, code, origin }: { quizId: number; code: CodeView; origin: string }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const link = `${origin}/q/${code.code}`;
  const report = `${origin}/quiz-codes/report/${code.reportToken}`;
  const base = `/admin/quizzes/${quizId}/codes/${code.id}`;
  const status = STATUS[code.status];
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-mono text-lg font-semibold tracking-wider">{code.code}</span>
        {code.label && <span>{code.label}</span>}
        <span className={`font-medium ${status.className}`}>{status.label}</span>
        <span className="text-muted">
          {code.opensOn || code.closesOn ? `${code.opensOn || "…"} to ${code.closesOn || "…"}` : "No dates"}
        </span>
        <span className="text-muted tabular-nums">
          {code.started} started · {code.finished} finished
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          Link: <code className="text-xs">{link}</code> <CopyButton text={link} label={`Copy link for ${code.code}`} />
        </span>
        <a href={`${base}/qr.svg`} download={`${code.code}-qr.svg`} className="text-brand underline underline-offset-4">
          QR code<span className="sr-only"> for {code.code}</span>
        </a>
        <a href={`${base}/flyer`} target="_blank" rel="noopener" className="text-brand underline underline-offset-4">
          Flyer<span className="sr-only"> for {code.code} (opens in a new tab)</span>
        </a>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          Teacher link (anonymous summary): <CopyButton text={report} label={`Copy teacher link for ${code.code}`} />
        </span>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!window.confirm(`Make a new teacher link for ${code.code}? The old link stops working.`)) return;
            start(async () => setMessage((await resetReportLinkAction(quizId, code.id)).message ?? null));
          }}
          className="text-brand underline underline-offset-4 disabled:opacity-60"
        >
          New teacher link<span className="sr-only"> for {code.code}</span>
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => void (await archiveCodeAction(quizId, code.id, code.status !== "archived")))}
          className={`${code.status === "archived" ? "text-brand" : "text-danger"} underline underline-offset-4 disabled:opacity-60`}
        >
          {code.status === "archived" ? "Restore" : "Archive"}
          <span className="sr-only"> {code.code}</span>
        </button>
        <p role="status" className="text-brand">
          {message ?? ""}
        </p>
      </div>
      <details>
        <summary className="cursor-pointer text-brand">
          Edit label and dates<span className="sr-only"> for {code.code}</span>
        </summary>
        <EditCodeForm quizId={quizId} code={code} />
      </details>
    </li>
  );
}

export function CodesSection({
  quizId,
  requireCode,
  codes,
  suggestion,
  origin,
  published,
}: {
  quizId: number;
  requireCode: boolean;
  codes: CodeView[];
  suggestion: string;
  origin: string;
  published: boolean;
}) {
  return (
    <div className="flex flex-col gap-5 text-sm">
      <p className="max-w-2xl text-muted">
        Codes for mailers, flyers and classes. Each has a short link (<code>/q/CODE</code>), a QR code, a flyer, and a
        private teacher link with an anonymous summary (shown once 5 people have finished). Submissions record which
        code they came from.
      </p>
      {!published && <p className="text-muted">Links work once the quiz is published.</p>}
      <RequireCodeForm quizId={quizId} requireCode={requireCode} />
      <CreateCodeForm quizId={quizId} suggestion={suggestion} />
      {codes.length === 0 ? (
        <p className="text-muted">No codes yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border px-4">
          {codes.map((c) => (
            <CodeRowView key={c.id} quizId={quizId} code={c} origin={origin} />
          ))}
        </ul>
      )}
    </div>
  );
}
