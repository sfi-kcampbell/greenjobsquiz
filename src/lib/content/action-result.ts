import { z } from "zod";
import { ContentError } from "./errors";
import { fieldErrors } from "./validation";

/** What every admin server action returns to its form or editor. */
export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error?: string; fieldErrors?: Record<string, string> };

export type FormState = { ok?: boolean; error?: string; fieldErrors?: Record<string, string>; message?: string };

/** Turns expected failures into a result; rethrows anything unexpected. */
export function failure(error: unknown): { ok: false; error?: string; fieldErrors?: Record<string, string> } {
  if (error instanceof z.ZodError) return { ok: false, fieldErrors: fieldErrors(error) };
  if (error instanceof ContentError) {
    return error.field
      ? { ok: false, fieldErrors: { [error.field]: error.message } }
      : { ok: false, error: error.message };
  }
  throw error;
}

export const idSchema = z.coerce.number().int().positive();
