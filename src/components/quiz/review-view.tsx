"use client";

import { useEffect, useRef } from "react";
import type { PublicQuiz } from "@/lib/public/structure";
import type { Answers } from "./api";
import { picked, selectionProblem } from "./state";

/** Every question with the chosen answers, before submitting. */
export function ReviewView({
  quiz,
  answers,
  busy,
  error,
  onEdit,
  onBack,
  onSubmit,
}: {
  quiz: PublicQuiz;
  answers: Answers;
  busy: boolean;
  error: string | null;
  onEdit: (index: number) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold focus:outline-none sm:text-2xl">
        Check your answers
      </h2>
      <ol className="flex flex-col gap-3">
        {quiz.questions.map((q, index) => {
          const ids = picked(answers, q.id);
          const labels = q.answers.filter((a) => ids.includes(a.id)).map((a) => a.label);
          const problem = selectionProblem(q, ids);
          return (
            <li
              key={q.id}
              className={`flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-surface px-4 py-3 ${problem ? "border-danger" : "border-border"}`}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-sm text-muted">Question {index + 1}</span>
                <span className="font-medium">{q.title}</span>
                {labels.length > 0 ? (
                  <span>{labels.join(", ")}</span>
                ) : (
                  <span className="text-muted italic">Not answered</span>
                )}
                {problem && <span className="text-sm font-medium text-danger">{problem}</span>}
              </div>
              <button
                type="button"
                onClick={() => onEdit(index)}
                disabled={busy}
                className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-border/40 disabled:opacity-60"
              >
                Change<span className="sr-only"> answer to question {index + 1}</span>
              </button>
            </li>
          );
        })}
      </ol>
      {error && (
        <p role="alert" className="font-medium text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="rounded-md border border-border bg-surface px-5 py-2.5 font-medium hover:bg-border/40 disabled:opacity-60"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy}
          className="ml-auto rounded-md bg-brand px-6 py-2.5 font-medium text-white hover:bg-brand-strong disabled:opacity-60"
        >
          {busy ? "Working out your result…" : "See my result"}
        </button>
      </div>
    </div>
  );
}
