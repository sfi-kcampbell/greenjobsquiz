/** Errors the public API returns as `{ error: { code, message, details? } }`. */
export class PublicError extends Error {
  constructor(
    readonly status: number,
    readonly code: `quiz_${string}`,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PublicError";
  }
}

export const notFound = () => new PublicError(404, "quiz_not_found", "That quiz isn't available.");
