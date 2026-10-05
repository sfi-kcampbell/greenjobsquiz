import { describe, expect, it } from "vitest";
import type { ResultPayload } from "@/lib/public/sessions";
import type { PublicQuestion, PublicQuiz } from "@/lib/public/structure";
import type { SessionResponse } from "./api";
import { answeredCount, firstProblem, initialState, isSavable, overLimit, quizReducer, resumeIndex, selectionProblem, type QuizState } from "./state";

const question = (id: number, extra: Partial<PublicQuestion> = {}): PublicQuestion => ({
  id,
  title: `Q${id}`,
  helpHtml: null,
  type: "single",
  minSelect: 1,
  maxSelect: 1,
  required: true,
  answers: [
    { id: id * 10 + 1, label: "A", bodyHtml: null },
    { id: id * 10 + 2, label: "B", bodyHtml: null },
    { id: id * 10 + 3, label: "C", bodyHtml: null },
  ],
  ...extra,
});

const quiz: PublicQuiz = {
  id: 1,
  slug: "q",
  title: "Quiz",
  introHtml: null,
  layout: "stepped",
  settings: { allowSkip: false, showProgress: true, retakeAllowed: true, autoAdvance: false, runnersUpCount: 2 },
  structureVersion: 1,
  questions: [question(1), question(2, { required: false }), question(3)],
};

const session = (extra: Partial<SessionResponse> = {}): SessionResponse => ({
  status: "none",
  attemptNo: null,
  revision: 0,
  answers: {},
  currentIndex: 0,
  answeredCount: 0,
  total: 3,
  result: null,
  ...extra,
});

const result = { quiz: { id: 1, title: "Quiz", slug: "q" } } as ResultPayload;

const loaded = (s: SessionResponse, r: ResultPayload | null = null) =>
  quizReducer(initialState, { type: "loaded", quiz, session: s, result: r });

describe("loading", () => {
  it("shows the intro to a new respondent", () => {
    const s = loaded(session());
    expect(s.phase).toBe("intro");
    expect(s.quiz).toBe(quiz);
  });

  it("offers to resume at the first unanswered question", () => {
    const s = loaded(session({ status: "in_progress", revision: 4, answers: { "1": [11] }, answeredCount: 1 }));
    expect(s.phase).toBe("resume");
    expect(s.index).toBe(1);
    expect(quizReducer(s, { type: "resume" })).toMatchObject({ phase: "question", index: 1 });
    expect(s.revision).toBe(4);
    expect(s.answers).toEqual({ "1": [11] });
  });

  it("shows the result for a completed attempt", () => {
    const s = loaded(session({ status: "completed", answeredCount: 3 }), result);
    expect(s.phase).toBe("result");
    expect(s.result).toBe(result);
  });

  it("shows an error for a quiz with no questions", () => {
    const s = quizReducer(initialState, { type: "loaded", quiz: { ...quiz, questions: [] }, session: session(), result: null });
    expect(s.phase).toBe("error");
  });

  it("goes to the error state when loading fails, and back to loading on retry", () => {
    const failed = quizReducer(initialState, { type: "load_failed", message: "Offline" });
    expect(failed).toMatchObject({ phase: "error", error: "Offline" });
    expect(quizReducer(failed, { type: "reload" }).phase).toBe("loading");
  });
});

describe("answering", () => {
  const started = (): QuizState => quizReducer(loaded(session()), { type: "start" });

  it("blocks Next on an unanswered required question", () => {
    const s = started();
    expect(quizReducer(s, { type: "next" }).index).toBe(0);
    const answered = quizReducer(s, { type: "select", questionId: 1, answerIds: [12] });
    expect(quizReducer(answered, { type: "next" }).index).toBe(1);
  });

  it("lets an optional question be skipped, and Back keeps answers", () => {
    let s = quizReducer(started(), { type: "select", questionId: 1, answerIds: [12] });
    s = quizReducer(s, { type: "next" });
    s = quizReducer(s, { type: "next" });
    expect(s.index).toBe(2);
    s = quizReducer(quizReducer(s, { type: "back" }), { type: "back" });
    expect(s.index).toBe(0);
    expect(s.answers["1"]).toEqual([12]);
    expect(quizReducer(s, { type: "back" }).index).toBe(0);
  });

  it("counts answered questions, not position", () => {
    let s = quizReducer(started(), { type: "select", questionId: 3, answerIds: [31] });
    expect(answeredCount(s)).toBe(1);
    s = quizReducer(s, { type: "select", questionId: 3, answerIds: [] });
    expect(answeredCount(s)).toBe(0);
  });

  it("takes the server's answers on a stale save", () => {
    let s = quizReducer(started(), { type: "select", questionId: 1, answerIds: [12] });
    s = quizReducer(s, { type: "save_failed" });
    expect(s.saveFailed).toBe(true);
    s = quizReducer(s, { type: "saved", revision: 7, answers: { "1": [13], "2": [21] } });
    expect(s).toMatchObject({ revision: 7, answers: { "1": [13], "2": [21] }, saveFailed: false });
    expect(quizReducer(s, { type: "saved", revision: 8 }).answers).toEqual({ "1": [13], "2": [21] });
  });
});

describe("submitting", () => {
  const complete = { "1": [11], "3": [31] };

  it("shows the result once submitted", () => {
    let s = quizReducer({ ...loaded(session()), answers: complete, phase: "review" }, { type: "submit" });
    expect(s.phase).toBe("submitting");
    s = quizReducer(s, { type: "submitted", result });
    expect(s).toMatchObject({ phase: "result", result });
  });

  it("returns to the first missing question the server reports", () => {
    let s = quizReducer({ ...loaded(session()), answers: complete, phase: "review" }, { type: "submit" });
    s = quizReducer(s, { type: "submit_failed", message: "Answer the rest", missingQuestionIds: [3, 1] });
    expect(s).toMatchObject({ phase: "question", index: 2, error: "Answer the rest", fromReview: true });
  });

  it("stays on the review screen for other submit errors", () => {
    let s = quizReducer({ ...loaded(session()), answers: complete, phase: "review" }, { type: "submit" });
    s = quizReducer(s, { type: "submit_failed", message: "Offline" });
    expect(s).toMatchObject({ phase: "review", error: "Offline" });
  });

  it("checks locally and jumps to the first problem without submitting", () => {
    const s = quizReducer({ ...loaded(session()), answers: { "1": [11] }, phase: "review" }, { type: "submit" });
    expect(s).toMatchObject({ phase: "question", index: 2, error: "Choose an answer to continue.", fromReview: true });
  });
});

describe("review", () => {
  it("goes to review after the last question, and Back returns to it", () => {
    let s: QuizState = { ...loaded(session()), phase: "question", index: 2, answers: { "3": [31] } };
    s = quizReducer(s, { type: "next" });
    expect(s.phase).toBe("review");
    s = quizReducer(s, { type: "back" });
    expect(s).toMatchObject({ phase: "question", index: 2 });
  });

  it("edits one answer and returns to review", () => {
    let s: QuizState = { ...loaded(session()), phase: "review", answers: { "1": [11], "3": [31] } };
    s = quizReducer(s, { type: "edit", index: 0 });
    expect(s).toMatchObject({ phase: "question", index: 0, fromReview: true });
    s = quizReducer(quizReducer(s, { type: "select", questionId: 1, answerIds: [12] }), { type: "next" });
    expect(s).toMatchObject({ phase: "review", fromReview: false, answers: { "1": [12] } });
  });
});

describe("restart", () => {
  it("starts a fresh attempt at question 1", () => {
    let s: QuizState = { ...loaded(session()), phase: "result", result, answers: { "1": [11] }, index: 2 };
    s = quizReducer(s, { type: "restart" });
    expect(s.restarting).toBe(true);
    s = quizReducer(s, { type: "restarted", revision: 1 });
    expect(s).toMatchObject({ phase: "question", index: 0, answers: {}, result: null, revision: 1, restarting: false });
  });

  it("keeps the current screen and shows why when a restart fails", () => {
    let s: QuizState = { ...loaded(session()), phase: "result", result };
    s = quizReducer(quizReducer(s, { type: "restart" }), { type: "restart_failed", message: "Only once" });
    expect(s).toMatchObject({ phase: "result", restarting: false, error: "Only once" });
  });
});

describe("helpers", () => {
  const multi = question(9, { type: "multi", minSelect: 2, maxSelect: 3, required: false });

  it("resumeIndex falls back to the last question when all are answered", () => {
    expect(resumeIndex(quiz, { "1": [11], "2": [21], "3": [31] })).toBe(2);
    expect(resumeIndex(quiz, {})).toBe(0);
  });

  it("selectionProblem checks required and multi-select limits", () => {
    expect(selectionProblem(question(1), [])).toMatch(/Choose an answer/);
    expect(selectionProblem(question(1), [11])).toBeNull();
    expect(selectionProblem(multi, [])).toBeNull();
    expect(selectionProblem(multi, [91])).toMatch(/at least 2/);
    expect(selectionProblem(multi, [91, 92])).toBeNull();
    expect(selectionProblem(multi, [91, 92, 93, 94])).toMatch(/up to 3/);
  });

  it("overLimit only fires above a multi-select maximum", () => {
    expect(overLimit(multi, 3)).toBeNull();
    expect(overLimit(multi, 4)).toBe("You can choose up to 3. Untick 1 to continue.");
    expect(overLimit(question(1), 2)).toBeNull();
  });

  it("firstProblem finds the first blocking question", () => {
    expect(firstProblem(quiz, { "1": [11], "3": [31] })).toBeNull();
    expect(firstProblem(quiz, { "3": [31] })).toEqual({ index: 0, message: "Choose an answer to continue." });
  });

  it("isSavable matches what the server accepts", () => {
    expect(isSavable(question(1), [])).toBe(true);
    expect(isSavable(question(1), [11])).toBe(true);
    expect(isSavable(question(1), [11, 12])).toBe(false);
    expect(isSavable(multi, [91])).toBe(false);
    expect(isSavable(multi, [91, 92, 93])).toBe(true);
  });
});
