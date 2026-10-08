"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import type { PublicQuestion } from "@/lib/public/structure";
import { ApiError, embedIdentity, quizApi, type Answers, type SessionResponse } from "./api";
import { CodeEntry } from "./code-entry";
import { errorMessage, saveErrorMessage } from "./messages";
import { Progress } from "./progress";
import { QuestionView } from "./question-view";
import { ResultView } from "./result-view";
import { ResumeView } from "./resume-view";
import { ReviewView } from "./review-view";
import { SinglePageView } from "./single-page-view";
import { SaveQueue } from "./save-queue";
import { answeredCount, currentQuestion, firstProblem, initialState, isSavable, quizReducer } from "./state";

/** The quiz code for this visit, per quiz; read by the API client when an attempt starts. */
const visitCodes = new Map<number, string>();

const answeredIn = (answers: Answers) => Object.values(answers).filter((ids) => ids.length > 0).length;

/** The server's session with queued (not yet saved) picks on top. */
function withQueued(session: SessionResponse, queued: Answers): SessionResponse {
  if (Object.keys(queued).length === 0) return session;
  const answers = { ...session.answers, ...queued };
  return {
    ...session,
    answers,
    answeredCount: answeredIn(answers),
    status: session.status === "none" ? "in_progress" : session.status,
  };
}

/**
 * The respondent client. All state comes from /api/v1 (never from the cached
 * page HTML). Answers go through a SaveQueue: debounced, one request at a
 * time, retried with backoff, mirrored to sessionStorage and flushed with
 * sendBeacon when the page goes away.
 */
export function QuizClient({
  quizId,
  intro,
  mode = "hosted",
}: {
  quizId: number;
  intro: ReactNode;
  /** "embed": inside an iframe on another site, where cookies are blocked (identity via localStorage + header). */
  mode?: "hosted" | "embed";
}) {
  const identity = useMemo(() => (mode === "embed" ? embedIdentity() : null), [mode]);
  // The quiz code for this visit (from ?code= or typed in), sent when an attempt starts.
  const [code, setCode] = useState<string | null>(null);
  const [codeChecking, setCodeChecking] = useState(true);
  const [codeNotice, setCodeNotice] = useState<string | null>(null);
  const api = useMemo(() => quizApi(quizId, identity, () => visitCodes.get(quizId) ?? null), [quizId, identity]);
  const codeKey = `pltq:code:${quizId}`;
  const [state, dispatch] = useReducer(quizReducer, initialState);
  const rootRef = useRef<HTMLDivElement>(null);
  const queue = useMemo(
    () =>
      new SaveQueue({
        send: (questionId, entry, clientRevision) =>
          api.saveAnswer({ questionId, answerIds: entry.answerIds, clientRevision, currentIndex: entry.currentIndex }),
        // Stale: another tab or an old page wrote too. The server's set wins, except for picks still queued here.
        onSaved: (res, overlay) =>
          dispatch({ type: "saved", revision: res.revision, answers: res.stale && res.answers ? { ...res.answers, ...overlay } : undefined }),
        onGaveUp: (error) => dispatch({ type: "save_failed", message: saveErrorMessage(error) }),
        onDropped: (error) => dispatch({ type: "save_failed", message: saveErrorMessage(error) }),
        storage: typeof window === "undefined" ? null : safeSessionStorage(),
        storageKey: `pltq:pending:${quizId}`,
      }),
    [api, quizId],
  );
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emit = useCallback((name: string, detail: Record<string, unknown>) => {
    rootRef.current?.dispatchEvent(new CustomEvent(name, { bubbles: true, detail: { quizId, ...detail } }));
  }, [quizId]);

  /* --------------------------------- Code -------------------------------- */

  const applyCode = useCallback(
    (value: string | null) => {
      if (value) visitCodes.set(quizId, value);
      else visitCodes.delete(quizId);
      setCode(value);
      const storage = safeSessionStorage();
      try {
        if (value) storage?.setItem(codeKey, value);
        else storage?.removeItem(codeKey);
      } catch {
        // memory only
      }
    },
    [codeKey, quizId],
  );

  /** Checks a code with the server; returns a message for the respondent, or null when it's accepted. */
  const checkCode = useCallback(
    async (value: string): Promise<string | null> => {
      try {
        const res = await api.checkCode(value);
        if (res.valid) {
          applyCode(res.code);
          return null;
        }
        return res.opensAt
          ? `${res.message} It opens on ${new Date(res.opensAt).toLocaleDateString(undefined, { dateStyle: "long", timeZone: "UTC" })}.`
          : res.message;
      } catch (error) {
        return errorMessage(error);
      }
    },
    [api, applyCode],
  );

  // A code from the link (/q/CODE or ?code=), or one entered earlier in this visit.
  useEffect(() => {
    let given: string | null = null;
    try {
      given = new URLSearchParams(window.location.search).get("code") ?? safeSessionStorage()?.getItem(codeKey) ?? null;
    } catch {
      given = null;
    }
    let cancelled = false;
    (async () => {
      const problem = given ? await checkCode(given) : null;
      if (cancelled) return;
      if (problem) {
        applyCode(null);
        setCodeNotice(problem);
      }
      setCodeChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [applyCode, checkCode, codeKey]);

  /* --------------------------------- Load -------------------------------- */

  useEffect(() => {
    if (state.phase !== "loading") return;
    let cancelled = false;
    (async () => {
      try {
        // In parallel: the structure is cacheable, the session never is.
        const [quiz, fetched] = await Promise.all([api.structure(), api.session()]);
        const result =
          fetched.status === "completed" && fetched.result ? (await api.result(fetched.result.shareToken)).result : null;
        if (cancelled) return;
        queue.sync(fetched.revision);
        // Picks that hadn't reached the server before the last reload or crash.
        let queued: Answers = {};
        if (fetched.status === "completed") queue.clear();
        else queued = queue.restore(fetched.attemptNo);
        dispatch({ type: "loaded", quiz, session: withQueued(fetched, queued), result });
        if (queue.size > 0) queue.flushNow().catch(() => {});
      } catch (error) {
        if (!cancelled) dispatch({ type: "load_failed", message: errorMessage(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, queue, state.phase]);

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

  // Back online: send what's waiting straight away.
  useEffect(() => {
    const online = () => queue.flushNow().catch(() => {});
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("online", online);
      queue.dispose();
    };
  }, [queue]);

  // Leaving (tab closed, app switched, navigated away): hand the queue to sendBeacon.
  useEffect(() => {
    const url = `/api/v1/quizzes/${quizId}/session/answers`;
    // Embeds identify by key, not cookie; sendBeacon can't set headers, so it goes in the body.
    const sessionKeyForBeacon = () => {
      const key = identity?.get();
      return { ...(key ? { sessionKey: key } : {}), ...(visitCodes.has(quizId) ? { code: visitCodes.get(quizId) } : {}) };
    };
    const flushOnExit = () => {
      if (typeof navigator.sendBeacon === "function") queue.beacon(url, (u, data) => navigator.sendBeacon(u, data), sessionKeyForBeacon());
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushOnExit();
    };
    window.addEventListener("pagehide", flushOnExit);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flushOnExit);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [identity, queue, quizId]);

  // Back/forward cache: the page is restored as it was, but the attempt may have moved on.
  useEffect(() => {
    const onPageShow = async (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      await queue.flushNow().catch(() => {});
      try {
        const fetched = await api.session();
        const result =
          fetched.status === "completed" && fetched.result ? (await api.result(fetched.result.shareToken)).result : null;
        if (fetched.status === "completed") queue.clear();
        queue.sync(fetched.revision);
        dispatch({ type: "refreshed", session: withQueued(fetched, queue.overlay()), result });
      } catch {
        // Offline: keep what's on screen; the queue retries on its own.
      }
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [api, queue]);

  const select = (question: PublicQuestion, index: number, answerIds: number[], how: { fromArrowKey: boolean }) => {
    dispatch({ type: "select", questionId: question.id, answerIds });
    emit("quiz:answer", { questionId: question.id, answerIds });
    if (!isSavable(question, answerIds)) return; // e.g. a multi-select below its minimum
    queue.set(question.id, answerIds, index);
    if (state.quiz?.layout === "single_page") return; // auto-advance is for one-at-a-time only

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
    queue.clear();
    await queue.settle();
    try {
      const session = await api.restart();
      queue.sync(session.revision, session.attemptNo);
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
      await queue.flushNow();
    } catch (error) {
      dispatch({ type: "submit_failed", message: saveErrorMessage(error) });
      return;
    }
    try {
      const res = await api.submit();
      dispatch({ type: "submitted", result: res.result, shareToken: res.shareToken });
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
        {state.phase === "question" && question && quiz?.layout !== "single_page" ? `Question ${state.index + 1} of ${total}` : ""}
        {state.phase === "review" ? "Check your answers before seeing your result." : ""}
        {state.phase === "submitting" ? "Working out your result…" : ""}
        {state.phase === "result" ? "Your result is ready." : ""}
      </p>

      {(state.phase === "loading" || state.phase === "intro") && (
        <div className="flex flex-col gap-6">
          {intro}
          {quiz?.settings.requireCode && !code && !codeChecking && state.phase === "intro" ? (
            <CodeEntry check={checkCode} initialError={codeNotice} />
          ) : (
          <div>
            {codeNotice && !quiz?.settings.requireCode && (
              <p role="status" className="mb-3 text-sm text-muted">
                {codeNotice} You can still take the quiz.
              </p>
            )}
            <button
              type="button"
              onClick={() => dispatch({ type: "start" })}
              disabled={state.phase === "loading" || codeChecking}
              className="pltq-button pltq-button--primary rounded-md border border-transparent bg-brand px-6 py-3 text-lg font-medium text-white hover:bg-brand-strong disabled:opacity-60"
            >
              {state.phase === "loading" || codeChecking ? "Loading…" : "Start"}
            </button>
            {quiz && (
              <p className="mt-2 text-sm text-muted">
                {total} question{total === 1 ? "" : "s"}
              </p>
            )}
          </div>
          )}
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
          {quiz.settings.showProgress && (
            <div className="no-print">
              <Progress answered={answeredCount(state)} total={total} />
            </div>
          )}
          {state.saveError && (
            <div role="status" className="no-print flex flex-wrap items-center gap-3 rounded-md border border-danger/40 bg-danger/5 px-4 py-2 text-sm">
              <span>{state.saveError}</span>
              <button type="button" onClick={() => queue.flushNow().catch(() => {})} className="font-medium text-danger underline underline-offset-4">
                Retry
              </button>
            </div>
          )}
          {quiz.layout === "single_page" ? (
            <SinglePageView
              quiz={quiz}
              answers={state.answers}
              busy={state.phase === "submitting"}
              error={state.error}
              errorIndex={state.error && state.phase === "question" ? state.index : null}
              onSelect={select}
              onSubmit={submit}
            />
          ) : state.phase === "question" && question ? (
            <QuestionView
              key={question.id}
              question={question}
              number={state.index + 1}
              total={total}
              selected={state.answers[String(question.id)] ?? []}
              nextLabel={state.fromReview ? "Back to review" : state.index === total - 1 ? "Review answers" : "Next"}
              busy={false}
              error={state.error}
              onSelect={(ids, how) => select(question, state.index, ids, how)}
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
          shareToken={state.shareToken}
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

/** sessionStorage, or null where it's blocked (some private modes throw on access). */
function safeSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
