/**
 * What respondents are told when a request fails. A network failure is
 * "check your connection"; a server failure is ours, never theirs.
 */
import { ApiError } from "./api";

const NETWORK = "We couldn't reach the server. Check your connection and try again.";
const SERVER = "Something went wrong on our side. Please try again in a moment.";

export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return SERVER;
  if (error.status === 0) return NETWORK;
  if (error.status >= 500) return SERVER;
  return error.message;
}

/** For the banner and submit after an answer couldn't be saved. */
export function saveErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 0) {
    return "We couldn't save your last answer. Check your connection.";
  }
  if (!(error instanceof ApiError) || error.status >= 500) {
    return "We couldn't save your last answer because of a problem on our side. Your answers are kept on this page.";
  }
  return error.message;
}
