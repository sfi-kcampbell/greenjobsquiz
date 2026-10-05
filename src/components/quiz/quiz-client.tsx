"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, type ReactNode } from "react";
import { ApiError, quizApi, type Answers } from "./api";
import { errorMessage, saveErrorMessage } from "./messages";
import { Progress } from "./progress";
import { QuestionView } from "./question-view";
import { ResultView } from "./result-view";
import { ResumeView } from "./resume-view";
import { ReviewView } from "./review-view";
import { answeredCount, currentQuestion, firstProblem, initialState, isSavable, quizReducer } from "./state";

type PendingSave = { answerIds: number[]; currentIndex: number };

/**
 * The respondent client. All state comes from /api/v1 (never from the cached
 * page HTML). Answers save in the background, one request at a time, keeping
 * only the latest pick per question.
 */
export function QuizClient({ quizId, intro }: { quizId: number; intro: ReactNode }) {
  const api = useMemo(() => quizApi(quizId), [quizId]);
  const [state, dispatch] = useReducer(quizReducer, initialState);
  const rootRef = useRef<HTMLDivElement>(null);
  const pending = useRef(new Map<number, PendingSave>());
  const revision = useRef(0);
  const running = useRef<Promise<void> | null>(null);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emit = useCallback((name: string, detail: Record<string, unknown>) => {
    rootRef.current?.dispatchEvent(new CustomEvent(name, { bubbles: true, detail: { quizId, ...detail } }));
  }, [quizId]);

  /* --------------------------------- Load -------------------------------- */

  useEffect(() => {
    if (state.phase !== "loading") return;
    let cancelled = false;
    (async () => {
      try {
        // In parallel: the structure is cacheable, the session never is.
        const [quiz, session] = await Promise.all([api.structure(), api.session()]);
        const result =
          session.status === "completed" && session.result ? (await api.result(session.result.shareToken)).result : null;
        if (cancelled) return;
        revision.current = session.revision;
        dispatch({ type: "loaded", quiz, session, result });
      } catch (error) {
        if (!cancelled) dispatch({ type: "load_failed", message: errorMessage(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, state.phase]);

  // Earlier attempts, shown under the result.
  const resultAttempt = state.result?.attemptNo;
  useEffect(() => {
    if (resultAttempt === undefined) return;
    let cancelled = false;
    api
      .attempts()
      .then((attempts) => !cancelled && dispatch({ type: "attempts", attempts }))
      .catch(() => {}); // optional extra; the result itself is already shown
    return () => {
      cancelled = true;
    };
  }, [api, resultAttempt]);

  // A pending auto-advance belongs to the question it was set on: drop it as soon as
  // the respondent moves (Next, Back, review) so it can't skip a question.
  useEffect(() => () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
  }, [state.index, state.phase]);

  /* --------------------------------- Save -------------------------------- */

  /** Sends queued answers one at a time. Rejects if a save fails (the entry stays queued). */
  const flush = useCallback((): Promise<void> => {
    if (running.current) return running.current;
    const run = (async () => {
      while (pending.current.size > 0) {
        const [questionId, entry] = pending.current.entries().next().value as [number, PendingSave];
        let res;
        try {
          res = await api.saveAnswer({
            questionId,
            answerIds: entry.answerIds,
            clientRevision: revision.current,
            currentIndex: entry.currentIndex,
          });
        } catch (error) {
          dispatch({ type: "save_failed", message: saveErrorMessage(error) });
          throw error;
        }
        // A newer pick for the same question may have been queued meanwhile.
        if (pending.current.get(questionId) === entry) pending.current.delete(questionId);
        revision.current = res.revision;
        let answers: Answers | undefined;
        if (res.stale && res.answers) {
          answers = { ...res.answers };
          for (const [id, p] of pending.current) answers[String(id)] = p.answerIds;
        }
        dispatch({ type: "saved", revision: res.revision, answers });
      }
    })();
    running.current = run.finally(() => {
      running.current = null;
    });
    return running.current;
  }, [api]);

  const select = (answerIds: number[], how: { fromArrowKey: boolean } = { fromArrowKey: false }) => {
    const question = currentQuestion(state);
    if (!question) return;
    dispatch({ type: "select", questionId: question.id, answerIds });
    emit("quiz:answer", { questionId: question.id, answerIds });
    if (!isSavable(question, answerIds)) return; // e.g. a multi-select below its minimum
    pending.current.set(question.id, { answerIds, currentIndex: state.index });
    flush().catch(() => {});

    // Optional auto-advance for single-choice questions; Next is always there too.
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    // Never on arrow keys: in a radio group they move the selection, and moving on
    // would stop keyboard users from reaching the other answers.
    if (state.quiz?.settings.autoAdvance && question.type === "single" && answerIds.length === 1 && !how.fromArrowKey) {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      advanceTimer.current = setTimeout(() => dispatch({ type: "next" }), reduce ? 0 : 400);
    }
  };

  /* -------------------------------- Restart ------------------------------ */

  /** A new attempt; the previous one (and any result) is kept on the server. */
  const restart = async () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    dispatch({ type: "restart" });
    pending.current.clear();
    await running.current?.catch(() => {});
    try {
      const session = await api.restart();
      revision.current = session.revision;
      dispatch({ type: "restarted", revision: session.revision });
      emit("quiz:restart", { attemptNo: session.attemptNo });
    } catch (error) {
      dispatch({ type: "restart_failed", message: errorMessage(error) });
    }
  };

  /* -------------------------------- Submit ------------------------------- */

  const submit = async () => {
    if (state.quiz && firstProblem(state.quiz, state.answers)) {
      dispatch({ type: "submit" }); // the reducer moves to the first problem
      return;
    }
    dispatch({ type: "submit" });
    try {
      await flush();
    } catch (error) {
      dispatch({ type: "submit_failed", message: saveErrorMessage(error) });
      return;
    }
    try {
      const res = await api.submit();
      dispatch({ type: "submitted", result: res.result });
      emit("quiz:complete", { resultId: res.result.match?.resultId ?? null, title: res.result.match?.title ?? null });
    } catch (error) {
      const missing = error instanceof ApiError ? error.details?.questionIds : undefined;
      dispatch({
        type: "submit_failed",
        message:
          error instanceof ApiError && error.code === "quiz_missing_answers"
            ? "Please answer this question to see your result."
            : errorMessage(error),
        missingQuestionIds: Array.isArray(missing) ? missing.filter((id): id is number => typeof id === "number") : undefined,
      });
    }
  };

  /* -------------------------------- Render ------------------------------- */

  const { quiz } = state;
  const question = currentQuestion(state);
  const total = quiz?.questions.length ?? 0;

  return (
    <div ref={rootRef} className="flex flex-col gap-6" data-quiz-phase={state.phase}>
      {/* One polite announcement per step; the step itself isn't a live region. */}
      <p aria-live="polite" className="sr-only">
        {state.phase === "question" && question ? `Question ${state.index + 1} of ${total}` : ""}
        {state.phase === "review" ? "Check your answers before seeing your result." : ""}
        {state.phase === "submitting" ? "Working out your result…" : ""}
        {state.phase === "result" ? "Your result is ready." : ""}
      </p>

      {(state.phase === "loading" || state.phase === "intro") && (
        <div className="flex flex-col gap-6">
          {intro}
          <div>
            <button
              type="button"
              onClick={() => dispatch({ type: "start" })}
              disabled={state.phase === "loading"}
              className="rounded-md border border-transparent bg-brand px-6 py-3 text-lg font-medium text-white hover:bg-brand-strong disabled:opacity-60"
            >
              {state.phase === "loading" ? "Loading…" : "Start"}
            </button>
            {quiz && (
              <p className="mt-2 text-sm text-muted">
                {total} question{total === 1 ? "" : "s"}
              </p>
            )}
          </div>
        </div>
      )}

      {state.phase === "resume" && quiz && (
        <ResumeView
          answered={answeredCount(state)}
          total={total}
          busy={state.restarting}
          error={state.error}
          onResume={() => dispatch({ type: "resume" })}
          onStartOver={restart}
        />
      )}

      {(state.phase === "question" || state.phase === "review" || state.phase === "submitting") && quiz && (
        <>
          {quiz.settings.showProgress && <Progress answered={answeredCount(state)} total={total} />}
          {state.saveError && (
            <div role="status" className="flex flex-wrap items-center gap-3 rounded-md border border-danger/40 bg-danger/5 px-4 py-2 text-sm">
              <span>{state.saveError}</span>
              <button type="button" onClick={() => flush().catch(() => {})} className="font-medium text-danger underline underline-offset-4">
                Retry
              </button>
            </div>
          )}
          {state.phase === "question" && question ? (
            <QuestionView
              key={question.id}
              question={question}
              number={state.index + 1}
              total={total}
              selected={state.answers[String(question.id)] ?? []}
              nextLabel={state.fromReview ? "Back to review" : state.index === total - 1 ? "Review answers" : "Next"}
              busy={false}
              error={state.error}
              onSelect={select}
              onBack={state.index > 0 && !state.fromReview ? () => dispatch({ type: "back" }) : null}
              onNext={() => dispatch({ type: "next" })}
            />
          ) : (
            <ReviewView
              quiz={quiz}
              answers={state.answers}
              busy={state.phase === "submitting"}
              error={state.error}
              onEdit={(index) => dispatch({ type: "edit", index })}
              onBack={() => dispatch({ type: "back" })}
              onSubmit={submit}
            />
          )}
        </>
      )}

      {state.phase === "result" && state.result && quiz && (
        <ResultView
          result={state.result}
          attempts={state.attempts}
          onRetake={quiz.settings.retakeAllowed ? restart : null}
          restarting={state.restarting}
          error={state.error}
        />
      )}

      {state.phase === "error" && (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-danger/40 bg-surface p-4">
          <p>{state.error}</p>
          <button
            type="button"
            onClick={() => dispatch({ type: "reload" })}
            className="rounded-md border border-border px-4 py-2 font-medium hover:bg-border/40"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
