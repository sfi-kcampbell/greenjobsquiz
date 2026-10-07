"use client";

import { useId, useRef, type Ref } from "react";
import type { PublicQuestion } from "@/lib/public/structure";
import { RichHtml } from "./rich-html";

/**
 * One question's fieldset: legend with its number, help, native radios or
 * checkboxes with plain-text labels (rich details outside them), and the
 * message, if any. Shared by the stepped and single-page layouts.
 */
export function QuestionFieldset({
  question,
  number,
  total,
  selected,
  message,
  onSelect,
  headingRef,
  firstInputRef,
}: {
  question: PublicQuestion;
  number: number;
  total: number;
  selected: number[];
  /** The problem to show and announce, if any. */
  message: string | null;
  /** `fromArrowKey`: the browser moved a radio selection with an arrow key. */
  onSelect: (answerIds: number[], how: { fromArrowKey: boolean }) => void;
  headingRef?: Ref<HTMLHeadingElement>;
  firstInputRef?: Ref<HTMLInputElement>;
}) {
  const uid = useId();
  /** Whether the latest key or pointer action in this question was an arrow key. */
  const lastWasArrow = useRef(false);
  const helpId = `${uid}-help`;
  const messageId = `${uid}-message`;
  const multi = question.type === "multi";

  const toggle = (answerId: number, checked: boolean) => {
    const how = { fromArrowKey: lastWasArrow.current };
    if (!multi) return onSelect([answerId], how);
    onSelect(checked ? [...selected, answerId] : selected.filter((id) => id !== answerId), how);
  };

  return (
    <>
      <fieldset
        onKeyDown={(e) => {
          lastWasArrow.current = e.key.startsWith("Arrow");
        }}
        onPointerDown={() => {
          lastWasArrow.current = false;
        }}
        aria-describedby={[question.helpHtml ? helpId : null, message ? messageId : null].filter(Boolean).join(" ") || undefined}
        aria-invalid={message ? true : undefined}
        className="pltq-question flex flex-col gap-4"
      >
        <legend className="mb-4 w-full">
          <span className="block text-sm font-medium text-muted">
            Question {number} of {total}
            {!question.required && " (optional)"}
          </span>
          <h2 ref={headingRef} tabIndex={-1} className="pltq-question-title mt-1 text-xl focus:outline-none font-semibold sm:text-2xl">
            {question.title}
          </h2>
        </legend>
        <RichHtml id={helpId} html={question.helpHtml} className="pltq-question-help -mt-2 text-muted" />
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
                data-selected={checked ? "" : undefined}
                className={`pltq-answer rounded-lg border-2 bg-surface px-4 py-3 ${checked ? "border-brand" : "border-border"} has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand`}
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
                <RichHtml id={detailsId} html={answer.bodyHtml} className="pltq-answer-details mt-1 pl-8 text-sm text-muted" />
              </div>
            );
          })}
        </div>
      </fieldset>

      {message && (
        <p id={messageId} role="alert" className="pltq-error font-medium text-danger">
          {message}
        </p>
      )}

    </>
  );
}
