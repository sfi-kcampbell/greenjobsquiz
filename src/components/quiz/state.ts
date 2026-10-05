/**
 * The respondent client's state machine. Pure, so it's unit-tested without a
 * browser: loading → intro | resume → question(i) → review → submitting →
 * result, plus error.
 */
import type { ResultPayload } from "@/lib/public/sessions";
import type { PublicQuestion, PublicQuiz } from "@/lib/public/structure";
import type { Answers, Attempt, SessionResponse } from "./api";

export type Phase = "loading" | "intro" | "resume" | "question" | "review" | "submitting" | "result" | "error";

export type QuizState = {
  phase: Phase;
  quiz: PublicQuiz | null;
  answers: Answers;
  index: number;
  revision: number;
  result: ResultPayload | null;
  /** Earlier submitted attempts (shown with the result). */
  attempts: Attempt[];
  /** A blocking problem (load failed) or a message shown on the question (submit failed). */
  error: string | null;
  /** Why the last save failed (the respondent can retry), or null. */
  saveError: string | null;
  /** Editing one answer from the review screen: Next returns there. */
  fromReview: boolean;
  /** A restart request is in flight. */
  restarting: boolean;
};

export type QuizAction =
  | { type: "loaded"; quiz: PublicQuiz; session: SessionResponse; result: ResultPayload | null }
  | { type: "load_failed"; message: string }
  | { type: "reload" }
  | { type: "start" }
  | { type: "resume" }
  | { type: "select"; questionId: number; answerIds: number[] }
  | { type: "next" }
  | { type: "back" }
  | { type: "edit"; index: number }
  | { type: "saved"; revision: number; answers?: Answers }
  | { type: "save_failed"; message: string }
  | { type: "submit" }
  | { type: "submitted"; result: ResultPayload }
  | { type: "submit_failed"; message: string; missingQuestionIds?: number[] }
  | { type: "attempts"; attempts: Attempt[] }
  | { type: "restart" }
  | { type: "restarted"; revision: number }
  | { type: "restart_failed"; message: string };

export const initialState: QuizState = {
  phase: "loading",
  quiz: null,
  answers: {},
  index: 0,
  revision: 0,
  result: null,
  attempts: [],
  error: null,
  saveError: null,
  fromReview: false,
  restarting: false,
};

export const picked = (answers: Answers, questionId: number) => answers[String(questionId)] ?? [];

/** Where a returning respondent picks up: the first unanswered question, else the last one. */
export function resumeIndex(quiz: PublicQuiz, answers: Answers): number {
  const first = quiz.questions.findIndex((q) => picked(answers, q.id).length === 0);
  return first === -1 ? Math.max(0, quiz.questions.length - 1) : first;
}

/** Why this selection can't move on yet, or null if it can. */
export function selectionProblem(question: PublicQuestion, answerIds: number[]): string | null {
  const count = answerIds.length;
  if (count === 0) return question.required ? "Choose an answer to continue." : null;
  if (question.type === "single") return null;
  if (count < question.minSelect) {
    return `Choose at least ${question.minSelect} answers. You've chosen ${count}.`;
  }
  if (count > question.maxSelect) return overLimit(question, count);
  return null;
}

/** Shown as soon as a multi-select goes over its maximum (nothing is ever disabled). */
export function overLimit(question: PublicQuestion, count: number): string | null {
  if (question.type !== "multi" || count <= question.maxSelect) return null;
  return `You can choose up to ${question.maxSelect}. Untick ${count - question.maxSelect} to continue.`;
}

/** True when the server will accept this selection (empty clears the question). */
export function isSavable(question: PublicQuestion, answerIds: number[]): boolean {
  if (answerIds.length === 0) return true;
  const min = question.type === "single" ? 1 : question.minSelect;
  const max = question.type === "single" ? 1 : question.maxSelect;
  return answerIds.length >= min && answerIds.length <= max;
}

/** The first question that would stop a submit, with its message. */
export function firstProblem(quiz: PublicQuiz, answers: Answers): { index: number; message: string } | null {
  for (const [index, q] of quiz.questions.entries()) {
    const message = selectionProblem(q, picked(answers, q.id));
    if (message) return { index, message };
  }
  return null;
}

export function answeredCount(state: Pick<QuizState, "quiz" | "answers">): number {
  return state.quiz?.questions.filter((q) => picked(state.answers, q.id).length > 0).length ?? 0;
}

export function currentQuestion(state: QuizState): PublicQuestion | null {
  return state.quiz?.questions[state.index] ?? null;
}

export function quizReducer(state: QuizState, action: QuizAction): QuizState {
  switch (action.type) {
    case "loaded": {
      const { quiz, session, result } = action;
      const base = { ...initialState, quiz, revision: session.revision, answers: session.answers };
      if (!quiz.questions.length) return { ...base, phase: "error", error: "This quiz has no questions yet." };
      if (session.status === "completed" && result) return { ...base, phase: "result", result };
      if (session.status === "in_progress" && session.answeredCount > 0) {
        return { ...base, phase: "resume", index: resumeIndex(quiz, session.answers) };
      }
      return { ...base, phase: "intro" };
    }
    case "load_failed":
      return { ...state, phase: "error", error: action.message };
    case "reload":
      return { ...initialState };
    case "start":
      return { ...state, phase: "question", index: 0, error: null, fromReview: false };
    case "resume":
      return { ...state, phase: "question", error: null };
    case "select":
      return { ...state, answers: { ...state.answers, [String(action.questionId)]: action.answerIds }, error: null };
    case "next": {
      const question = currentQuestion(state);
      if (!state.quiz || !question || selectionProblem(question, picked(state.answers, question.id))) return state;
      const last = state.index === state.quiz.questions.length - 1;
      if (last || state.fromReview) return { ...state, phase: "review", error: null, fromReview: false };
      return { ...state, index: state.index + 1, error: null };
    }
    case "back":
      if (state.phase === "review") return { ...state, phase: "question", error: null };
      return { ...state, index: Math.max(0, state.index - 1), error: null, fromReview: false };
    case "edit":
      return { ...state, phase: "question", index: action.index, error: null, fromReview: true };
    case "saved":
      return {
        ...state,
        revision: action.revision,
        // Stale: another tab or an old page wrote too. The server's set wins.
        answers: action.answers ?? state.answers,
        saveError: null,
      };
    case "save_failed":
      return { ...state, saveError: action.message };
    case "submit": {
      // Check locally first, so the respondent lands on the first problem without a round trip.
      const problem = state.quiz && firstProblem(state.quiz, state.answers);
      if (problem) return { ...state, phase: "question", index: problem.index, error: problem.message, fromReview: true };
      return { ...state, phase: "submitting", error: null };
    }
    case "submitted":
      return { ...state, phase: "result", result: action.result, error: null };
    case "submit_failed": {
      const missing = action.missingQuestionIds?.[0];
      const missingIndex = missing === undefined ? -1 : (state.quiz?.questions.findIndex((q) => q.id === missing) ?? -1);
      if (missingIndex >= 0) {
        return { ...state, phase: "question", index: missingIndex, error: action.message, fromReview: true };
      }
      return { ...state, phase: "review", error: action.message };
    }
    case "attempts":
      return { ...state, attempts: action.attempts };
    case "restart":
      return { ...state, restarting: true, error: null };
    case "restarted":
      return {
        ...state,
        phase: "question",
        index: 0,
        answers: {},
        revision: action.revision,
        result: null,
        error: null,
        saveError: null,
        fromReview: false,
        restarting: false,
      };
    case "restart_failed":
      return { ...state, restarting: false, error: action.message };
  }
}
