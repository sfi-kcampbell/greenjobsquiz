# PLT Green Jobs Quiz

A personality-style quiz that recommends a response, such as a green career. The full product and technical spec is in [SPEC.md](SPEC.md).

**Stack:** Next.js 16 (App Router, TypeScript) on Vercel · Neon Postgres · Drizzle ORM · Auth.js magic-link sign-in via Resend.

## Status

- **Phase 0** (skeleton): database schema and migrations, staff sign-in, Super Admin / Admin roles, the admin shell and the Staff screen.
- **Phase 1** (Categories): the quiz list, quiz settings, the builder shell, and the Categories tab (add, edit, reorder, delete, suggested set).
- **Phase 2** (Questions): question cards with an answers × categories weight matrix (keyboard entry, row and column totals), rich-text answer details and help text, and drag-to-reorder for questions and answers. Images for questions and answers come later, with media storage.
- **Phase 3** (Responses): a responses × categories weight grid with live near-duplicate and no-weights warnings and "Normalize to 10", plus an editor per response (summary, rich description, call to action, and a Category Profile with live bars).
- **Phase 4** (Scoring): the scoring engine (`src/lib/scoring/engine.ts`, pure and fully unit-tested), the Simulate tab (answer as a respondent, see the ranked responses and category profile, and search for answers that produce a given response), the Health tab with its warning count on the tab, and scoring settings (runners-up, category balancing, fallback response) on the quiz settings page.
- **Phase 5** (Public API): publishing, and the `/api/v1` API for respondents: quiz structure (never weights), saved progress, restart, server-side scoring on submit, shareable result links, and attempt history.
- **Phase 6** (Quiz page): the public quiz page at `/quizzes/{slug}` (title, intro, questions one at a time, answers saved as they're picked, and the result with runners-up and a category profile), published quizzes listed on the home page, and an Introduction field in quiz settings. The page HTML is cached and holds no respondent data; editing the title, slug or intro, publishing, unpublishing or deleting a quiz refreshes it immediately. Direct database edits show up within 5 minutes.

See the build order in SPEC.md for what comes next.

## Roles

- **Super Admin:** any email listed in `SUPER_ADMINS` (comma-separated). Checked on every request, never stored. Can do everything, including managing staff, Submissions and Settings.
- **Admin:** invited by a Super Admin on **Admin → Staff**. Can create and edit quizzes.

Anyone else is refused at sign-in. Disabling or removing an Admin signs them out immediately.

## Temporary PIN sign-in

Until Resend is configured, staff can sign in with their email plus a shared PIN:

1. In Vercel, set `SECRET_PIN` (at least 6 characters; longer is better) and redeploy.
2. On `/sign-in`, use the **Sign in with PIN** card. The email must still be a Super Admin or an active Admin.

PIN sessions last 12 hours. Attempts are limited to 5 per 15 minutes per IP address and 30 per 15 minutes overall. **Delete `SECRET_PIN` and redeploy before launch**; the PIN option disappears as soon as the variable is gone.

## Public API (`/api/v1`)

Used by the hosted quiz pages, the embed and any headless app. Only **published** quizzes are visible; drafts return 404.

| Method | Path | Notes |
|---|---|---|
| GET | `/quizzes` | Published quizzes |
| GET | `/quizzes/{id}`, `/quizzes/by-slug/{slug}` | Questions and answers (never weights). Cacheable, with ETag |
| GET | `/quizzes/{id}/session` | The respondent's progress. Creates nothing |
| PUT | `/quizzes/{id}/session/answer` | `{questionId, answerIds, clientRevision?, currentIndex?}`. The first one returns `sessionKey` and sets the `pltq_visitor` cookie |
| POST | `/quizzes/{id}/session/answers` | Batch (`sendBeacon`); accepts `sessionKey` in the body |
| POST | `/quizzes/{id}/session/restart` | New attempt; earlier ones are kept |
| POST | `/quizzes/{id}/submit` | `{email?}`. Scores on the server and returns the result and share link |
| GET | `/results/{token}` | A shared result |
| GET | `/quizzes/{id}/attempts` | The respondent's past attempts |

Respondents are identified by the `X-Quiz-Session` header (embeds and headless apps) or the `pltq_visitor` cookie (the hosted pages). Errors look like `{"error": {"code": "quiz_…", "message": "…"}}`.

**Required in production: `TOKEN_PEPPER`**, a long random value (for example `openssl rand -hex 32`). Respondent sessions and share links are stored as keyed hashes with it, so **never change it** once respondents have used the quiz.

**If you put a CDN in front of Vercel**, exclude `/api/v1/quizzes/*/session*`, `/api/v1/quizzes/*/submit`, `/api/v1/quizzes/*/attempts` and `/api/v1/results/*` from caching. A cached session response would show one visitor another's progress.

Cross-site API access (headless apps) is allowed only for origins listed in the `settings` table's `cors_origins`; a Settings screen for this comes later.

## Local development

Requires Node 22+ and a Postgres database (a Neon dev branch, or local Postgres 16).

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL, AUTH_SECRET, SUPER_ADMINS
npm run db:migrate
npm run dev
```

Integration tests need a **separate, throwaway** Postgres database in `TEST_DATABASE_URL`. Every table in it is emptied between tests.

Open http://localhost:3000/admin and sign in with an email from `SUPER_ADMINS`. Without `AUTH_RESEND_KEY`, the sign-in link is printed in the terminal running `npm run dev`.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Applies migrations, then builds (this is what Vercel runs) |
| `npm test` | Unit tests, plus integration tests when `TEST_DATABASE_URL` is set |
| `npm run test:int` | Integration tests only (needs `TEST_DATABASE_URL`) |
| `npm run typecheck` | Generates route types and runs `tsc` |
| `npm run lint` | ESLint |
| `npm run db:generate` | Creates a migration after editing `src/lib/db/schema.ts` |
| `npm run db:migrate` | Applies pending migrations |

## Deploying to Vercel

1. Import the repo into Vercel. `vercel.json` pins the framework to Next.js. In **Settings → Build and Deployment**, leave the Output Directory override off (an override set to `public` causes "No Output Directory named public").
2. Add the **Neon** integration from the Vercel Marketplace. It sets `DATABASE_URL` and `DATABASE_URL_UNPOOLED`, and can create a database branch for each preview deployment.
3. Set `AUTH_SECRET`, `SUPER_ADMINS`, `APP_URL`, `AUTH_RESEND_KEY` and `EMAIL_FROM` for Production (and Preview if you use it).
4. In Resend, verify the domain used in `EMAIL_FROM`.
5. Deploy. The build applies migrations before building, so the database is always current.

Without `AUTH_RESEND_KEY`, production can't send sign-in links and nobody can sign in.
