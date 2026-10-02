# PLT Green Jobs Quiz

A personality-style quiz that recommends a green job type. The full product and technical spec is in [SPEC.md](SPEC.md).

**Stack:** Next.js 16 (App Router, TypeScript) on Vercel · Neon Postgres · Drizzle ORM · Auth.js magic-link sign-in via Resend.

## Status

Phase 0 (skeleton) is done: database schema and migrations, staff sign-in, Super Admin / Admin roles, the admin shell and the Staff screen. See the build order in SPEC.md for what comes next.

## Roles

- **Super Admin:** any email listed in `SUPER_ADMINS` (comma-separated). Checked on every request, never stored. Can do everything, including managing staff, Submissions and Settings.
- **Admin:** invited by a Super Admin on **Admin → Staff**. Can create and edit quizzes.

Anyone else is refused at sign-in. Disabling or removing an Admin signs them out immediately.

## Local development

Requires Node 22+ and a Postgres database (a Neon dev branch, or local Postgres 16).

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL, AUTH_SECRET, SUPER_ADMINS
npm run db:migrate
npm run dev
```

Open http://localhost:3000/admin and sign in with an email from `SUPER_ADMINS`. Without `AUTH_RESEND_KEY`, the sign-in link is printed in the terminal running `npm run dev`.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Applies migrations, then builds (this is what Vercel runs) |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | Generates route types and runs `tsc` |
| `npm run lint` | ESLint |
| `npm run db:generate` | Creates a migration after editing `src/lib/db/schema.ts` |
| `npm run db:migrate` | Applies pending migrations |

## Deploying to Vercel

1. Import the repo into Vercel (framework preset: Next.js).
2. Add the **Neon** integration from the Vercel Marketplace. It sets `DATABASE_URL` and `DATABASE_URL_UNPOOLED`, and can create a database branch for each preview deployment.
3. Set `AUTH_SECRET`, `SUPER_ADMINS`, `APP_URL`, `AUTH_RESEND_KEY` and `EMAIL_FROM` for Production (and Preview if you use it).
4. In Resend, verify the domain used in `EMAIL_FROM`.
5. Deploy. The build applies migrations before building, so the database is always current.

Without `AUTH_RESEND_KEY`, production can't send sign-in links and nobody can sign in.
