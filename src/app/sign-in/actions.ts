"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/auth";
import { pinMatches, pinSignInEnabled } from "@/lib/auth/pin-check";
import { verifyPin } from "@/lib/auth/staff-pin";
import { anyStaffPins, staffPinMatches } from "@/lib/auth/staff-pins-store";
import { isSuperAdminEmail } from "@/lib/auth/super-admins";
import { db } from "@/lib/db/client";
import { createStaffSession } from "@/lib/auth/pin-session";
import { resolveStaff } from "@/lib/auth/staff";
import { clientIpHash, hit } from "@/lib/rate-limit/fixed-window";

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

export type PinSignInState = { error?: string; email?: string };

const PIN_WINDOW_SECONDS = 15 * 60;
const PIN_LIMIT_PER_IP = 5;
const PIN_LIMIT_GLOBAL = 30;

/**
 * Temporary sign-in while email sending isn't set up: Super Admins use
 * SECRET_PIN, Admins use their own PIN from the Staff screen.
 */
export async function signInWithPin(
  _prev: PinSignInState,
  formData: FormData,
): Promise<PinSignInState> {
  if (!pinSignInEnabled() && !(await anyStaffPins(db))) return { error: "PIN sign-in is turned off." };

  const raw = String(formData.get("email") ?? "");

  // Every attempt counts, before any checking, so the limit can't be dodged.
  const [perIp, global] = await Promise.all([
    hit(`pin:ip:${await clientIpHash()}`, PIN_LIMIT_PER_IP, PIN_WINDOW_SECONDS),
    hit("pin:global", PIN_LIMIT_GLOBAL, PIN_WINDOW_SECONDS),
  ]);
  if (!perIp.allowed || !global.allowed) {
    return { email: raw, error: "Too many attempts. Try again in a few minutes." };
  }

  const email = z.email().safeParse(raw.trim());
  const pin = String(formData.get("pin") ?? "");
  // Same message for a wrong PIN and a non-staff email, so neither can be probed.
  const incorrect = { email: raw, error: "Email or PIN is incorrect." };
  if (!email.success || !pin) return incorrect;
  let matches: boolean;
  if (isSuperAdminEmail(email.data)) {
    // The dummy check keeps this path as slow as an Admin's, so timing doesn't reveal Super Admins.
    await verifyPin(pin, null);
    matches = pinMatches(pin);
  } else {
    matches = await staffPinMatches(db, email.data, pin);
  }
  if (!matches) return incorrect;

  const staff = await resolveStaff(email.data);
  if (!staff) return incorrect;

  await createStaffSession(staff.email);
  redirect("/admin");
}
