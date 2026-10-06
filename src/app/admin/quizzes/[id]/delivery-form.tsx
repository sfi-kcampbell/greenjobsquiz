"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/lib/content/action-result";
import { updateDeliveryAction } from "../actions";

type Values = {
  layout: "stepped" | "single_page";
  layoutTemplate: "default" | "canvas";
  deliveryMode: "hosted" | "headless";
  headlessBaseUrl: string | null;
};

function Choice({ name, value, label, hint, checked, onChange }: {
  name: string;
  value: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange?: () => void;
}) {
  const id = `${name}-${value}`;
  return (
    <div className="flex items-start gap-2">
      <input id={id} type="radio" name={name} value={value} defaultChecked={checked} onChange={onChange} className="mt-1" aria-describedby={`${id}-hint`} />
      <div>
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        <p id={`${id}-hint`} className="text-muted">
          {hint}
        </p>
      </div>
    </div>
  );
}

export function DeliveryForm({ quizId, slug, values }: { quizId: number; slug: string; values: Values }) {
  const [state, action, pending] = useActionState<FormState, FormData>(updateDeliveryAction.bind(null, quizId), {});
  const [mode, setMode] = useState(values.deliveryMode);
  const [base, setBase] = useState(values.headlessBaseUrl ?? "");

  return (
    <form action={action} className="flex flex-col gap-5 text-sm">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">Questions</legend>
        <Choice name="layout" value="stepped" label="One at a time" hint="Each question on its own step, then a review screen." checked={values.layout === "stepped"} />
        <Choice name="layout" value="single_page" label="All on one page" hint="Every question in one scrolling form. Good for short quizzes." checked={values.layout === "single_page"} />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">Page template</legend>
        <Choice name="layoutTemplate" value="default" label="Standard" hint="With the site header and footer." checked={values.layoutTemplate === "default"} />
        <Choice name="layoutTemplate" value="canvas" label="Focused" hint="No header or footer: just the quiz." checked={values.layoutTemplate === "canvas"} />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">Delivery</legend>
        <Choice name="deliveryMode" value="hosted" label="Hosted on this site" hint="People take the quiz here, or in an embed on your site." checked={values.deliveryMode === "hosted"} onChange={() => setMode("hosted")} />
        <Choice
          name="deliveryMode"
          value="headless"
          label="Headless: your own front end"
          hint="Your app uses the API; visitors to this site's quiz page are sent there."
          checked={values.deliveryMode === "headless"}
          onChange={() => setMode("headless")}
        />
        {mode === "headless" && (
          <div className="ml-6 flex flex-col gap-1">
            <label htmlFor="headlessBaseUrl" className="font-medium">
              Front-end address
            </label>
            <input
              id="headlessBaseUrl"
              name="headlessBaseUrl"
              type="url"
              value={base}
              onChange={(e) => setBase(e.target.value)}
              placeholder="https://careers.example.org"
              aria-invalid={state.fieldErrors?.headlessBaseUrl ? true : undefined}
              aria-describedby="headlessBaseUrl-hint headlessBaseUrl-error"
              className="max-w-md rounded-md border border-border bg-surface px-2 py-1.5"
            />
            <p id="headlessBaseUrl-hint" className="text-muted">
              Visitors go to <code>{(base.replace(/\/+$/, "") || "https://…") + `/quizzes/${slug}`}</code>
            </p>
            {state.fieldErrors?.headlessBaseUrl && (
              <p id="headlessBaseUrl-error" className="text-danger">
                {state.fieldErrors.headlessBaseUrl}
              </p>
            )}
          </div>
        )}
        {mode === "hosted" && <input type="hidden" name="headlessBaseUrl" value={base} />}
      </fieldset>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-strong disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save delivery settings"}
        </button>
        <p role="status" className={state.error ? "text-danger" : "text-brand"}>
          {state.error ?? state.message ?? ""}
        </p>
      </div>
    </form>
  );
}

/** The copy-and-paste embed code. */
export function EmbedSnippet({ origin, slug, title }: { origin: string; slug: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const code = `<iframe src="${origin}/embed/${slug}" title="${esc(title)}" style="width:100%;border:0;min-height:480px" loading="lazy"></iframe>\n<script src="${origin}/embed.js" async></script>`;
  return (
    <div className="flex flex-col gap-2 text-sm">
      <label htmlFor="embed-code" className="font-medium">
        Embed on another site
      </label>
      <textarea id="embed-code" readOnly rows={3} value={code} className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs" onFocus={(e) => e.target.select()} />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
          className="rounded-md border border-border px-3 py-1.5 font-medium hover:bg-border/40"
        >
          Copy code
        </button>
        <p role="status" className="text-brand">
          {copied ? "Copied." : ""}
        </p>
      </div>
      <p className="text-muted">The frame resizes to fit the quiz. Which sites may embed it is set in Settings.</p>
    </div>
  );
}
