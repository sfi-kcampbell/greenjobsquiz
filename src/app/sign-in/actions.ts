"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/auth";

export type SignInState = { error?: string; email?: string };

export async function requestSignInLink(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const raw = String(formData.get("email") ?? "");
  const parsed = z.email().safeParse(raw.trim());
  if (!parsed.success) {
    return { error: "Enter a valid email address.", email: raw };
  }

  const accessDenied = {
    email: raw,
    error: "That email isn't authorized to sign in. Ask a Super Admin to invite you.",
  };
  const failed = { email: raw, error: "We couldn't send a sign-in link. Please try again." };

  let location: string;
  try {
    // redirect: false because Auth.js would otherwise redirect to an /api/auth
    // URL, which the App Router can't soft-navigate to from a server action.
    location = await signIn("resend", { email: parsed.data, redirectTo: "/admin", redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      return error.type === "AccessDenied" ? accessDenied : failed;
    }
    throw error;
  }

  const error = new URL(location, "http://localhost").searchParams.get("error");
  if (error === "AccessDenied") return accessDenied;
  if (error) return failed;

  redirect("/sign-in/check-email");
}
