"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicQuestion } from "@/lib/public/structure";
import { QuestionFieldset } from "./question-fieldset";
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
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const [showProblem, setShowProblem] = useState(false);
  const problem = selectionProblem(question, selected);
  // Over the maximum shows straight away; other problems wait for Next.
  const message = overLimit(question, selected.length) || (showProblem && problem) || error;

  // Move focus to the new question so keyboard and screen-reader users start there.
  // Sent back with a problem (e.g. a missing answer on submit)? Focus its first answer,
  // so the label, question and error are read together.
  const openedWithError = useRef(Boolean(error));
  useEffect(() => {
    if (openedWithError.current) firstInputRef.current?.focus();
    else headingRef.current?.focus();
  }, []);

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
      <QuestionFieldset
        question={question}
        number={number}
        total={total}
        selected={selected}
        message={message || null}
        onSelect={onSelect}
        headingRef={headingRef}
        firstInputRef={firstInputRef}
      />

      <div className="flex flex-wrap items-center gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            disabled={busy}
            className="pltq-button rounded-md border border-border bg-surface px-5 py-2.5 font-medium hover:bg-border/40 disabled:opacity-60"
          >
            Back
          </button>
        )}
        <button
          type="submit"
          disabled={busy}
          className="pltq-button pltq-button--primary ml-auto rounded-md border border-transparent bg-brand px-6 py-2.5 font-medium text-white hover:bg-brand-strong disabled:opacity-60"
        >
          {nextLabel}
        </button>
      </div>
    </form>
  );
}
