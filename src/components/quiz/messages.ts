/**
 * What respondents are told when a request fails, in their language. A
 * network failure is "check your connection"; a server failure is ours,
 * never theirs. Known API error codes use the catalog's wording; anything
 * else shows the server's (English) message.
 */
import { messagesFor, type Messages } from "@/lib/i18n";
import { ApiError } from "./api";

const EN = messagesFor("en");

function apiMessage(error: ApiError, m: Messages): string {
  if (error.code === "quiz_code_invalid") {
    const reason = error.details?.reason;
    if (reason === "not_open_yet") return m.codeNotOpenYet;
    if (reason === "closed") return m.codeClosed;
    return m.codeNotFound;
  }
  return m.errors[error.code] ?? error.message;
}

export function errorMessage(error: unknown, m: Messages = EN): string {
  if (!(error instanceof ApiError)) return m.serverError;
  if (error.status === 0) return m.networkError;
  if (error.status >= 500) return m.serverError;
  return apiMessage(error, m);
}

/** For the banner and submit after an answer couldn't be saved. */
export function saveErrorMessage(error: unknown, m: Messages = EN): string {
  if (error instanceof ApiError && error.status === 0) return m.saveNetworkError;
  if (!(error instanceof ApiError) || error.status >= 500) return m.saveServerError;
  return apiMessage(error, m);
}
