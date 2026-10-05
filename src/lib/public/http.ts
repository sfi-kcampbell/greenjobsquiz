import "server-only";
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { settings } from "@/lib/db/schema";
import { clientIpHash, hit } from "@/lib/rate-limit/fixed-window";
import { notFound, PublicError } from "./errors";
import { getPublishedQuiz, type PublicQuiz } from "./structure";
import { hashToken, isToken } from "./tokens";

/**
 * Shared plumbing for /api/v1: identity, cookies, caching, CORS, origin
 * checks, rate limits and error responses.
 */

export const VISITOR_COOKIE = "pltq_visitor";
export const SESSION_HEADER = "x-quiz-session";
const COOKIE_DAYS = 180;
const MAX_BODY_BYTES = 64 * 1024;

/* -------------------------------- Identity ------------------------------- */

export type Identity = { tokenHash: string | null; source: "header" | "cookie" | "body" | null };

/** Header first, then cookie. `bodyKey` is for sendBeacon, which can't set headers. */
export function identify(req: NextRequest, bodyKey?: unknown): Identity {
  const header = req.headers.get(SESSION_HEADER);
  if (isToken(header)) return { tokenHash: hashToken(header), source: "header" };
  if (isToken(bodyKey)) return { tokenHash: hashToken(bodyKey), source: "body" };
  const cookie = req.cookies.get(VISITOR_COOKIE)?.value;
  if (isToken(cookie)) return { tokenHash: hashToken(cookie), source: "cookie" };
  return { tokenHash: null, source: null };
}

function isHttps(req: NextRequest): boolean {
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return (proto ?? req.nextUrl.protocol.replace(":", "")) === "https";
}

/** Sets the visitor cookie. Only ever called from API responses, never cached HTML. */
export function setVisitorCookie(res: NextResponse, req: NextRequest, token: string) {
  res.cookies.set(VISITOR_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps(req),
    path: "/",
    maxAge: COOKIE_DAYS * 24 * 60 * 60,
  });
}

/* ------------------------------ Origins / CORS --------------------------- */

function ownOrigin(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
  return `${isHttps(req) ? "https" : "http"}://${host}`;
}

async function allowedOrigins(): Promise<string[]> {
  const [row] = await db.select({ cors: settings.corsOrigins }).from(settings).where(eq(settings.id, 1)).limit(1);
  const list = row?.cors ?? [];
  if (process.env.APP_URL) list.push(new URL(process.env.APP_URL).origin);
  return list.map((o) => o.replace(/\/+$/, "").toLowerCase());
}

async function originAllowed(req: NextRequest, origin: string): Promise<boolean> {
  const o = origin.toLowerCase();
  return o === ownOrigin(req).toLowerCase() || (await allowedOrigins()).includes(o);
}

/** Echo the Origin back only for allow-listed origins. Never `*`, never credentials. */
async function applyCors(req: NextRequest, res: NextResponse) {
  res.headers.append("Vary", "Origin");
  const origin = req.headers.get("origin");
  if (origin && origin.toLowerCase() !== ownOrigin(req).toLowerCase() && (await allowedOrigins()).includes(origin.toLowerCase())) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Expose-Headers", "ETag, Retry-After");
  }
}

/** Preflight for allow-listed origins. */
export async function preflight(req: NextRequest): Promise<NextResponse> {
  const res = new NextResponse(null, { status: 204 });
  await applyCors(req, res);
  if (res.headers.has("Access-Control-Allow-Origin")) {
    res.headers.set("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Content-Type, X-Quiz-Session, If-None-Match");
    res.headers.set("Access-Control-Max-Age", "600");
  }
  return res;
}

/**
 * Writes identified by the cookie must come from this site or an allowed
 * origin (CSRF defence). Header/body-token clients prove possession of the
 * token instead, so they're exempt.
 */
export async function checkWriteOrigin(req: NextRequest, identity: Identity) {
  if (identity.source === "header" || identity.source === "body") return;
  const origin = req.headers.get("origin");
  if (origin && !(await originAllowed(req, origin))) {
    throw new PublicError(403, "quiz_forbidden_origin", "Requests from this site aren't allowed.");
  }
}

/* -------------------------------- Limits --------------------------------- */

const LIMITS = { submit: 10, restart: 20, answer: 300 } as const;

/** Per IP and per respondent token, per hour. */
export async function rateLimit(action: keyof typeof LIMITS, tokenHash: string | null) {
  const limit = LIMITS[action];
  const checks = [hit(`api:${action}:ip:${await clientIpHash()}`, limit, 3600)];
  if (tokenHash) checks.push(hit(`api:${action}:token:${tokenHash}`, limit, 3600));
  const results = await Promise.all(checks);
  const blocked = results.find((r) => !r.allowed);
  if (blocked) {
    throw new PublicError(429, "quiz_rate_limited", "Too many requests. Please wait a moment and try again.", {
      retryAfter: blocked.retryAfterSeconds,
    });
  }
}

/* ------------------------------ Bodies / quiz ---------------------------- */

/** Parses a JSON body (any content type, so sendBeacon's text/plain works), capped at 64 KB. */
export async function readBody<T extends z.ZodType>(req: NextRequest, schema: T): Promise<z.infer<T>> {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new PublicError(413, "quiz_body_too_large", "Request body is too large.");
  let data: unknown = {};
  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new PublicError(400, "quiz_bad_json", "The request body isn't valid JSON.");
    }
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new PublicError(422, "quiz_invalid_request", "The request is missing or has invalid fields.", {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return parsed.data;
}

export async function loadPublishedQuiz(idParam: string): Promise<PublicQuiz> {
  const id = z.coerce.number().int().positive().safeParse(idParam);
  if (!id.success) throw notFound();
  const quiz = await getPublishedQuiz(db, { id: id.data });
  if (!quiz) throw notFound();
  return quiz;
}

/* -------------------------------- Responses ------------------------------ */

type Caching = { kind: "none" } | { kind: "public"; etag?: string; maxAge?: number };

/**
 * Browsers always revalidate (a cheap 304 thanks to the ETag); only shared
 * caches keep a copy. stale-while-revalidate in Cache-Control would let a
 * browser keep showing old settings for minutes after an admin change.
 */
function setPublicCaching(res: NextResponse, maxAge = 300) {
  res.headers.set("Cache-Control", "public, max-age=0, must-revalidate");
  res.headers.set("CDN-Cache-Control", `public, s-maxage=${maxAge}, stale-while-revalidate=600`);
}

export async function respond(req: NextRequest, body: unknown, opts: { status?: number; caching?: Caching } = {}) {
  const caching = opts.caching ?? { kind: "none" };
  const res = NextResponse.json(body, { status: opts.status ?? 200 });
  if (caching.kind === "public") {
    setPublicCaching(res, caching.maxAge);
    if (caching.etag) res.headers.set("ETag", caching.etag);
  } else {
    res.headers.set("Cache-Control", "no-store, private");
    res.headers.append("Vary", "Cookie");
    res.headers.append("Vary", SESSION_HEADER);
  }
  await applyCors(req, res);
  return res;
}

/** 304 when the client already has this version. */
export async function notModified(req: NextRequest, etag: string): Promise<NextResponse | null> {
  const match = req.headers.get("if-none-match");
  if (!match || !match.split(",").map((s) => s.trim()).includes(etag)) return null;
  const res = new NextResponse(null, { status: 304 });
  res.headers.set("ETag", etag);
  setPublicCaching(res);
  await applyCors(req, res);
  return res;
}

export async function errorResponse(req: NextRequest, error: unknown): Promise<NextResponse> {
  if (error instanceof PublicError) {
    const res = await respond(req, { error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } }, { status: error.status });
    const retry = error.details?.retryAfter;
    if (typeof retry === "number") res.headers.set("Retry-After", String(retry));
    return res;
  }
  console.error("[api] Unexpected error:", error);
  return respond(req, { error: { code: "quiz_server_error", message: "Something went wrong. Please try again." } }, { status: 500 });
}

/** Wraps a route handler with the standard error handling. */
export function route<C>(handler: (req: NextRequest, ctx: C) => Promise<NextResponse>) {
  return async (req: NextRequest, ctx: C) => {
    try {
      return await handler(req, ctx);
    } catch (error) {
      return errorResponse(req, error);
    }
  };
}

/** Absolute base URL for links in responses. */
export function baseUrl(req: NextRequest): string {
  return process.env.APP_URL?.replace(/\/+$/, "") ?? ownOrigin(req);
}

export function resultLinks(req: NextRequest, shareToken: string) {
  const base = baseUrl(req);
  return {
    shareUrl: `${base}/quiz-result/${shareToken}`,
    printUrl: `${base}/quiz-result/${shareToken}?autoprint=1`,
    resultApiUrl: `${base}/api/v1/results/${shareToken}`,
  };
}
