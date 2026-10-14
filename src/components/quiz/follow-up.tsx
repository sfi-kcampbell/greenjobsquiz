"use client";

import { useRef, useState } from "react";
import type { PublicQuestion } from "@/lib/public/structure";
import type { Answers } from "./api";
import { errorMessage } from "./messages";
import { QuestionFieldset } from "./question-fieldset";
import { overLimit, picked, selectionProblem } from "./state";

/**
 * Follow-up questions under the result. Never scored: the result above stays
 * as it is whether or not they're answered. Hidden when printing.
 */
export function FollowUp({
  questions,
  sent,
  onSend,
}: {
  questions: PublicQuestion[];
  /** Answers already saved (a returning visitor sees "Thanks"). */
  sent: Answers;
  onSend: (answers: Answers) => Promise<void>;
}) {
  const [answers, setAnswers] = useState<Answers>(sent);
  const [editing, setEditing] = useState(Object.keys(sent).length === 0);
  const [showProblems, setShowProblems] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstInputs = useRef<(HTMLInputElement | null)[]>([]);
  const thanksRef = useRef<HTMLParagraphElement>(null);

  return (
    <section aria-labelledby="follow-up-heading" className="pltq-follow-up no-print flex flex-col gap-4 rounded-lg border border-border bg-surface p-4">
      <h2 id="follow-up-heading" className="text-lg font-semibold">
        A few more questions
      </h2>
      {!editing ? (
        <div className="flex flex-wrap items-center gap-3">
          <p ref={thanksRef} tabIndex={-1} role="status" className="font-medium text-brand focus:outline-none">
            Thanks, your answers were saved.
          </p>
          <button type="button" onClick={() => setEditing(true)} className="pltq-button rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-border/40">
            Change my answers
          </button>
        </div>
      ) : (
        <form
          noValidate
          className="flex flex-col gap-8"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            const first = questions.findIndex((q) => selectionProblem(q, picked(answers, q.id)));
            if (first >= 0) {
              setShowProblems(true);
              firstInputs.current[first]?.focus();
              return;
            }
            setBusy(true);
            setError(null);
            try {
              await onSend(answers);
              setEditing(false);
              requestAnimationFrame(() => thanksRef.current?.focus());
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="-mt-2 text-muted">These don&apos;t change your result.</p>
          {questions.map((q, i) => (
            <QuestionFieldset
              key={q.id}
              question={q}
              number={i + 1}
              total={questions.length}
              selected={picked(answers, q.id)}
              message={overLimit(q, picked(answers, q.id).length) || (showProblems ? selectionProblem(q, picked(answers, q.id)) : null)}
              onSelect={(ids) => setAnswers((a) => ({ ...a, [String(q.id)]: ids }))}
              firstInputRef={(el) => {
                firstInputs.current[i] = el;
              }}
            />
          ))}
          {error && (
            <p role="alert" className="pltq-error font-medium text-danger">
              {error}
            </p>
          )}
          <div>
            <button
              type="submit"
              disabled={busy}
              className="pltq-button pltq-button--primary rounded-md border border-transparent bg-brand px-6 py-2.5 font-medium text-white hover:bg-brand-strong disabled:opacity-60"
            >
              {busy ? "Sending…" : "Send answers"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
