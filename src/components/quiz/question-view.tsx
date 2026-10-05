"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { PublicQuestion } from "@/lib/public/structure";
import { RichHtml } from "./rich-html";
import { overLimit, selectionProblem } from "./state";

/**
 * One question as a real form: fieldset/legend, native radios or checkboxes,
 * plain-text labels with any rich details outside them. Enter means Next.
 * Mount with `key={question.id}` so per-question state resets.
 */
export function QuestionView({
  question,
  number,
  total,
  selected,
  nextLabel,
  busy,
  error,
  onSelect,
  onBack,
  onNext,
}: {
  question: PublicQuestion;
  number: number;
  total: number;
  selected: number[];
  nextLabel: string;
  busy: boolean;
  /** A message from the controller (e.g. submit failed). */
  error: string | null;
  /** `fromArrowKey`: the browser moved a radio selection with an arrow key (never auto-advance on that). */
  onSelect: (answerIds: number[], how: { fromArrowKey: boolean }) => void;
  onBack: (() => void) | null;
  onNext: () => void;
}) {
  const uid = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  /** Whether the latest key or pointer action in this question was an arrow key. */
  const lastWasArrow = useRef(false);
  const [showProblem, setShowProblem] = useState(false);
  const problem = selectionProblem(question, selected);
  // Over the maximum shows straight away; other problems wait for Next.
  const message = overLimit(question, selected.length) || (showProblem && problem) || error;
  const helpId = `${uid}-help`;
  const messageId = `${uid}-message`;
  const multi = question.type === "multi";

  // Move focus to the new question so keyboard and screen-reader users start there.
  // Sent back with a problem (e.g. a missing answer on submit)? Focus its first answer,
  // so the label, question and error are read together.
  const openedWithError = useRef(Boolean(error));
  useEffect(() => {
    if (openedWithError.current) firstInputRef.current?.focus();
    else headingRef.current?.focus();
  }, []);

  const toggle = (answerId: number, checked: boolean) => {
    const how = { fromArrowKey: lastWasArrow.current };
    if (!multi) return onSelect([answerId], how);
    onSelect(checked ? [...selected, answerId] : selected.filter((id) => id !== answerId), how);
  };

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        if (problem) return setShowProblem(true);
        onNext();
      }}
      className="flex flex-col gap-6"
    >
      <fieldset
        onKeyDown={(e) => {
          lastWasArrow.current = e.key.startsWith("Arrow");
        }}
        onPointerDown={() => {
          lastWasArrow.current = false;
        }}
        aria-describedby={[question.helpHtml ? helpId : null, message ? messageId : null].filter(Boolean).join(" ") || undefined}
        aria-invalid={message ? true : undefined}
        className="flex flex-col gap-4"
      >
        <legend className="mb-4 w-full">
          <span className="block text-sm font-medium text-muted">
            Question {number} of {total}
            {!question.required && " (optional)"}
          </span>
          <h2 ref={headingRef} tabIndex={-1} className="mt-1 text-xl focus:outline-none font-semibold sm:text-2xl">
            {question.title}
          </h2>
        </legend>
        <RichHtml id={helpId} html={question.helpHtml} className="-mt-2 text-muted" />
        {multi && (
          <p className="text-sm text-muted">
            {question.minSelect === question.maxSelect
              ? `Choose ${question.maxSelect}.`
              : `Choose ${question.minSelect} to ${question.maxSelect}.`}
          </p>
        )}

        <div className="flex flex-col gap-3">
          {question.answers.map((answer, i) => {
            const inputId = `${uid}-a${answer.id}`;
            const detailsId = `${inputId}-details`;
            const checked = selected.includes(answer.id);
            return (
              <div
                key={answer.id}
                className={`rounded-lg border-2 bg-surface px-4 py-3 ${checked ? "border-brand" : "border-border"} has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand`}
              >
                <label htmlFor={inputId} className="flex cursor-pointer items-start gap-3">
                  <input
                    id={inputId}
                    ref={i === 0 ? firstInputRef : undefined}
                    type={multi ? "checkbox" : "radio"}
                    name={`q${question.id}`}
                    value={answer.id}
                    checked={checked}
                    onChange={(e) => toggle(answer.id, e.target.checked)}
                    // Also point at the error: fieldset descriptions aren't read everywhere.
                    aria-describedby={[answer.bodyHtml ? detailsId : null, message ? messageId : null].filter(Boolean).join(" ") || undefined}
                    className="mt-1 size-5 shrink-0 accent-brand focus-visible:outline-none"
                  />
                  <span className={`text-lg ${checked ? "font-semibold" : ""}`}>{answer.label}</span>
                </label>
                <RichHtml id={detailsId} html={answer.bodyHtml} className="mt-1 pl-8 text-sm text-muted" />
              </div>
            );
          })}
        </div>
      </fieldset>

      {message && (
        <p id={messageId} role="alert" className="font-medium text-danger">
          {message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            disabled={busy}
            className="rounded-md border border-border bg-surface px-5 py-2.5 font-medium hover:bg-border/40 disabled:opacity-60"
          >
            Back
          </button>
        )}
        <button
          type="submit"
          disabled={busy}
          className="ml-auto rounded-md border border-transparent bg-brand px-6 py-2.5 font-medium text-white hover:bg-brand-strong disabled:opacity-60"
        >
          {nextLabel}
        </button>
      </div>
    </form>
  );
}
