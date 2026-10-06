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
  /** Returned once, when the respondent's token is created. */
  sessionKey?: string;
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

export type Attempt = {
  attemptNo: number;
  createdAt: string;
  resultTitle: string | null;
  percent: number | null;
  shareToken: string | null;
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

/** Where an embed keeps the respondent's key (third-party cookies are blocked in iframes). */
export type Identity = { get(): string | null; set(key: string): void };

const VISITOR_KEY = "pltq:visitor";

/** localStorage-backed identity for embeds, falling back to memory if storage is blocked. */
export function embedIdentity(): Identity {
  let memory: string | null = null;
  return {
    get() {
      try {
        return window.localStorage.getItem(VISITOR_KEY) ?? memory;
      } catch {
        return memory;
      }
    },
    set(key) {
      memory = key;
      try {
        window.localStorage.setItem(VISITOR_KEY, key);
      } catch {
        // memory only, for this page's life
      }
    },
  };
}

async function call<T>(path: string, init: RequestInit = {}, identity?: Identity | null): Promise<T> {
  const key = identity?.get();
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      credentials: "same-origin",
      cache: "no-store",
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(key ? { "X-Quiz-Session": key } : {}),
        ...init.headers,
      },
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

export function quizApi(quizId: number, identity: Identity | null = null) {
  const base = `/quizzes/${quizId}`;
  const send = <T,>(path: string, init: RequestInit = {}) => call<T>(path, init, identity);
  return {
    // The structure may come from the HTTP cache (ETag); nothing else may. It's the same for everyone.
    structure: () => call<{ quiz: PublicQuiz }>(base, { cache: "default" }).then((r) => r.quiz),
    session: () => send<SessionResponse>(`${base}/session`),
    saveAnswer: (body: { questionId: number; answerIds: number[]; clientRevision?: number; currentIndex?: number }) =>
      send<SaveResponse>(`${base}/session/answer`, { method: "PUT", body: JSON.stringify(body) }).then((res) => {
        // First answer from an embed: keep the new key for every later call.
        if (res.sessionKey && identity && !identity.get()) identity.set(res.sessionKey);
        return res;
      }),
    submit: () => send<SubmitResponse>(`${base}/submit`, { method: "POST", body: "{}" }),
    restart: () => send<Omit<SessionResponse, "result">>(`${base}/session/restart`, { method: "POST", body: "{}" }),
    attempts: () => send<{ attempts: Attempt[] }>(`${base}/attempts`).then((r) => r.attempts),
    result: (token: string) => send<ResultLinks & { result: ResultPayload }>(`/results/${encodeURIComponent(token)}`),
  };
}
