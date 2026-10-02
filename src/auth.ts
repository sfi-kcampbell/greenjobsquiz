import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { resolveStaff } from "@/lib/auth/staff";
import { db } from "@/lib/db/client";
import { accounts, sessions, users, verificationTokens } from "@/lib/db/schema";
import { buttonEmail, sendEmail } from "@/lib/mail";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database", maxAge: 30 * 24 * 60 * 60 },
  trustHost: true,
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: process.env.EMAIL_FROM,
      maxAge: 15 * 60, // magic links expire after 15 minutes
      async sendVerificationRequest({ identifier, url }) {
        const { html, text } = buttonEmail({
          heading: "Sign in to PLT Quiz",
          body: "Use the button below to sign in. The link expires in 15 minutes and works once.",
          url,
          button: "Sign in",
        });
        await sendEmail({ to: identifier, subject: "Your PLT Quiz sign-in link", html, text });
      },
    }),
  ],
  pages: {
    signIn: "/sign-in",
    verifyRequest: "/sign-in/check-email",
    error: "/sign-in",
  },
  callbacks: {
    // Runs when the link is requested *and* when it's clicked, so an Admin
    // disabled in between can't finish signing in. Unknown emails get no link.
    async signIn({ user }) {
      return (await resolveStaff(user.email)) !== null;
    },
  },
});
