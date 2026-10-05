/**
 * The respondent client's state machine. Pure, so it's unit-tested without a
 * browser: loading → intro → question(i) → submitting → result, plus error.
 */
import type { ResultPayload } from "@/lib/public/sessions";
import type { PublicQuestion, PublicQuiz } from "@/lib/public/structure";
import type { Answers, SessionResponse } from "./api";

export type Phase = "loading" | "intro" | "question" | "submitting" | "result" | "error";

export type QuizState = {
  phase: Phase;
  quiz: PublicQuiz | null;
  answers: Answers;
  index: number;
  revision: number;
  result: ResultPayload | null;
  /** A blocking problem (load failed) or a message shown on the question (submit failed). */
  error: string | null;
  /** Some answers couldn't be saved; the respondent can retry. */
  saveFailed: boolean;
};

export type QuizAction =
  | { type: "loaded"; quiz: PublicQuiz; session: SessionResponse; result: ResultPayload | null }
  | { type: "load_failed"; message: string }
  | { type: "reload" }
  | { type: "start" }
  | { type: "select"; questionId: number; answerIds: number[] }
  | { type: "next" }
  | { type: "back" }
  | { type: "saved"; revision: number; answers?: Answers }
  | { type: "save_failed" }
  | { type: "submit" }
  | { type: "submitted"; result: ResultPayload }
  | { type: "submit_failed"; message: string; missingQuestionIds?: number[] };

export const initialState: QuizState = {
  phase: "loading",
  quiz: null,
  answers: {},
  index: 0,
  revision: 0,
  result: null,
  error: null,
  saveFailed: false,
};

const picked = (answers: Answers, questionId: number) => answers[String(questionId)] ?? [];

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
    return `Choose at least ${question.minSelect} answers.`;
  }
  if (count > question.maxSelect) return `Choose at most ${question.maxSelect} answers.`;
  return null;
}

/** True when the server will accept this selection (empty clears the question). */
export function isSavable(question: PublicQuestion, answerIds: number[]): boolean {
  if (answerIds.length === 0) return true;
  const min = question.type === "single" ? 1 : question.minSelect;
  const max = question.type === "single" ? 1 : question.maxSelect;
  return answerIds.length >= min && answerIds.length <= max;
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
      if (session.status === "completed" && result) return { ...base, phase: "result", result };
      if (session.status === "in_progress" && session.answeredCount > 0) {
        return { ...base, phase: "question", index: resumeIndex(quiz, session.answers) };
      }
      return { ...base, phase: quiz.questions.length ? "intro" : "error", error: quiz.questions.length ? null : "This quiz has no questions yet." };
    }
    case "load_failed":
      return { ...state, phase: "error", error: action.message };
    case "reload":
      return { ...initialState };
    case "start":
      return { ...state, phase: "question", index: 0, error: null };
    case "select":
      return { ...state, answers: { ...state.answers, [String(action.questionId)]: action.answerIds }, error: null };
    case "next": {
      const question = currentQuestion(state);
      if (!state.quiz || !question || selectionProblem(question, picked(state.answers, question.id))) return state;
      return { ...state, index: Math.min(state.index + 1, state.quiz.questions.length - 1), error: null };
    }
    case "back":
      return { ...state, index: Math.max(0, state.index - 1), error: null };
    case "saved":
      return {
        ...state,
        revision: action.revision,
        // Stale: another tab or an old page wrote too. The server's set wins.
        answers: action.answers ?? state.answers,
        saveFailed: false,
      };
    case "save_failed":
      return { ...state, saveFailed: true };
    case "submit":
      return { ...state, phase: "submitting", error: null };
    case "submitted":
      return { ...state, phase: "result", result: action.result, error: null };
    case "submit_failed": {
      const missing = action.missingQuestionIds?.[0];
      const missingIndex = missing === undefined ? -1 : (state.quiz?.questions.findIndex((q) => q.id === missing) ?? -1);
      return {
        ...state,
        phase: "question",
        index: missingIndex >= 0 ? missingIndex : state.index,
        error: action.message,
      };
    }
  }
}
