/**
 * Browser client for /api/v1. Same-origin, so the visitor cookie carries the
 * respondent's identity; the embed (Phase 10) will add X-Quiz-Session.
 */
import type { ResultPayload, SessionView } from "@/lib/public/sessions";
import type { PublicQuiz } from "@/lib/public/structure";

export type Answers = Record<string, number[]>;

export type ResultLinks = { shareUrl: string; printUrl: string; resultApiUrl: string };

export type SessionResponse = Omit<SessionView, "result"> & {
  result: (NonNullable<SessionView["result"]> & ResultLinks) | null;
};

export type SaveResponse = {
  revision: number;
  stale: boolean;
  answers?: Answers;
  answeredCount: number;
  total: number;
  attemptNo: number | null;
};

export type SubmitResponse = ResultLinks & {
  shareToken: string;
  alreadySubmitted: boolean;
  result: ResultPayload;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const NETWORK_MESSAGE = "We couldn't reach the server. Check your connection and try again.";

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      credentials: "same-origin",
      cache: "no-store",
      ...init,
      headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    });
  } catch {
    throw new ApiError(0, "quiz_network_error", NETWORK_MESSAGE);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = data?.error;
    throw new ApiError(
      res.status,
      typeof error?.code === "string" ? error.code : "quiz_server_error",
      typeof error?.message === "string" ? error.message : "Something went wrong. Please try again.",
      error?.details,
    );
  }
  return data as T;
}

export function quizApi(quizId: number) {
  const base = `/quizzes/${quizId}`;
  return {
    // The structure may come from the HTTP cache (ETag); nothing else may.
    structure: () => call<{ quiz: PublicQuiz }>(base, { cache: "default" }).then((r) => r.quiz),
    session: () => call<SessionResponse>(`${base}/session`),
    saveAnswer: (body: { questionId: number; answerIds: number[]; clientRevision?: number; currentIndex?: number }) =>
      call<SaveResponse>(`${base}/session/answer`, { method: "PUT", body: JSON.stringify(body) }),
    submit: () => call<SubmitResponse>(`${base}/submit`, { method: "POST", body: "{}" }),
    result: (token: string) => call<ResultLinks & { result: ResultPayload }>(`/results/${encodeURIComponent(token)}`),
  };
}
