"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicQuestion, PublicQuiz } from "@/lib/public/structure";
import type { Answers } from "./api";
import { QuestionFieldset } from "./question-fieldset";
import { overLimit, picked, selectionProblem } from "./state";

/**
 * Every question in one form ("All on one page"). Problems show on submit;
 * focus goes to the first problem question's first answer.
 */
export function SinglePageView({
  quiz,
  answers,
  busy,
  error,
  errorIndex,
  onSelect,
  onSubmit,
}: {
  quiz: PublicQuiz;
  answers: Answers;
  busy: boolean;
  /** A message from the controller (submit failed). */
  error: string | null;
  /** The question that message belongs to, or null for a general one. */
  errorIndex: number | null;
  onSelect: (question: PublicQuestion, index: number, answerIds: number[], how: { fromArrowKey: boolean }) => void;
  onSubmit: () => void;
}) {
  const [showProblems, setShowProblems] = useState(false);
  const firstInputs = useRef<(HTMLInputElement | null)[]>([]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const total = quiz.questions.length;

  // The controller sent us back to a question (e.g. the server says it's missing).
  useEffect(() => {
    if (error && errorIndex !== null) firstInputs.current[errorIndex]?.focus();
  }, [error, errorIndex]);

  const messageFor = (q: PublicQuestion, i: number) => {
    const ids = picked(answers, q.id);
    return (
      overLimit(q, ids.length) ||
      (showProblems ? selectionProblem(q, ids) : null) ||
      (error && errorIndex === i ? error : null)
    );
  };

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        const first = quiz.questions.findIndex((q) => selectionProblem(q, picked(answers, q.id)));
        if (first >= 0) {
          setShowProblems(true);
          firstInputs.current[first]?.focus();
          return;
        }
        onSubmit();
      }}
      className="flex flex-col gap-10"
    >
      <h2 ref={headingRef} tabIndex={-1} className="sr-only">
        {total} questions
      </h2>
      {quiz.questions.map((q, i) => (
        <div key={q.id} className="flex flex-col gap-4">
          <QuestionFieldset
            question={q}
            number={i + 1}
            total={total}
            selected={picked(answers, q.id)}
            message={messageFor(q, i)}
            onSelect={(ids, how) => onSelect(q, i, ids, how)}
            firstInputRef={(el) => {
              firstInputs.current[i] = el;
            }}
          />
        </div>
      ))}
      {error && errorIndex === null && (
        <p role="alert" className="font-medium text-danger">
          {error}
        </p>
      )}
      <div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md border border-transparent bg-brand px-6 py-2.5 font-medium text-white hover:bg-brand-strong disabled:opacity-60"
        >
          {busy ? "Working out your result…" : "See my result"}
        </button>
      </div>
    </form>
  );
}
