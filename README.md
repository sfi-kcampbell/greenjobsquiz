# PLT Green Jobs Quiz

A personality-style quiz that recommends a response, such as a green career. The full product and technical spec is in [SPEC.md](SPEC.md).

**Stack:** Next.js 16 (App Router, TypeScript) on Vercel · Neon Postgres · Drizzle ORM · Auth.js magic-link sign-in via Resend.

## Status

- **Phase 0** (skeleton): database schema and migrations, staff sign-in, Super Admin / Admin roles, the admin shell and the Staff screen.
- **Phase 1** (Categories): the quiz list, quiz settings, the builder shell, and the Categories tab (add, edit, reorder, delete, suggested set).
- **Phase 2** (Questions): question cards with an answers × categories weight matrix (keyboard entry, row and column totals), rich-text answer details and help text, and drag-to-reorder for questions and answers.
- **Phase 3** (Responses): a responses × categories weight grid with live near-duplicate and no-weights warnings and "Normalize to 10", plus an editor per response (summary, rich description, call to action, and a Category Profile with live bars).
- **Phase 4** (Scoring): the scoring engine (`src/lib/scoring/engine.ts`, pure and fully unit-tested), the Simulate tab (answer as a respondent, see the ranked responses and category profile, and search for answers that produce a given response), the Health tab with its warning count on the tab, and scoring settings (runners-up, category balancing, fallback response) on the quiz settings page.
- **Phase 5** (Public API): publishing, and the `/api/v1` API for respondents: quiz structure (never weights), saved progress, restart, server-side scoring on submit, shareable result links, and attempt history.
- **Phase 6** (Quiz page): the public quiz page at `/quizzes/{slug}` (title, intro, questions one at a time, answers saved as they're picked, and the result with runners-up and a category profile), published quizzes listed on the home page, and an Introduction field in quiz settings. The page HTML is cached and holds no respondent data; editing the title, slug or intro, publishing, unpublishing or deleting a quiz refreshes it immediately. Direct database edits show up within 5 minutes.
- **Phase 7** (Full quiz flow): multi-select limits (nothing is disabled; going over the maximum shows a message straight away), a "Check your answers" review step with Change links, client-side checks that jump to the first unanswered required question, a "Welcome back — Resume / Start over" prompt, "Take it again" with earlier results listed under the result, and Respondent options in quiz settings (progress bar, auto-advance for single-choice questions, retakes).
- **Phase 8** (Accessibility): an axe-core audit of every respondent screen and the main admin screens (no violations), a keyboard-only run of the whole quiz, and fixes: auto-advance never fires on arrow keys, a missing answer on submit puts focus on that question's first answer, errors are attached to each input, off-site links in quiz content open in a new tab, bars and buttons stay visible in Windows High Contrast, and reduced motion removes the auto-advance delay. Screen-reader checklist below.
- **Phase 9** (Resilience): answers go through an outbox (`src/components/quiz/save-queue.ts`) that waits 250 ms to merge quick changes, sends one request at a time, retries at 1, 2, 4, 8, 16 and 30 seconds (honouring `Retry-After`) and only then shows "couldn't save — Retry". It's mirrored to `sessionStorage` so a reload loses nothing, sends anything unsaved with `sendBeacon` when the tab closes, flushes as soon as the connection comes back, and re-checks the session when the back button restores the page.
- **Phase 10** (Delivery): a `/quizzes` index; per-quiz Delivery settings (one question at a time or all on one page; Standard or Focused page template; hosted or headless, where headless quiz pages redirect to your front end); an embed (`/embed/{slug}` plus `public/embed.js`, which sizes the frame and passes on quiz events) with a copy-and-paste snippet in quiz settings; and Settings → "Embedding and API access" for which sites may embed quizzes and which may call the API from the browser.
- **Phase 11** (Print and share): the result screen has **Print**, **Copy link** (or **Share** on phones) and **Printable page**. Share links open `/quiz-result/{token}`, a standalone page that anyone with the link can see (never cached or indexed, and it sends no referrer). `?autoprint=1` opens the print dialog. A print stylesheet hides buttons and site chrome, prints black on white, keeps bar colours and percentages, and shows link addresses; the browser's "Save as PDF" makes the PDF. Clearing a submission's `share_token_hash` revokes its link (or use **Turn off share link** on the submission's page).
- **Phase 12** (Submissions, Super Admin only): a list of every finished attempt with filters (quiz, matched response, date range in UTC, search over email and response), sortable columns, paging, and single or bulk delete, with all of it kept in the URL; and a detail page with the respondent and timing, the ranking with each runner-up's gap to first place, the category profile (raw, normalized, max), and the answers with the weights and contributions stored at submit time. Deleting a submission lets that respondent start the quiz fresh.
- **Phase 13** (CSV export): from Submissions, **Long** (one row per answered question) or **Wide** (one row per attempt with raw and normalized scores per category; needs a quiz filter), using the list's filters and order. Files stream in batches of 500 with a UTF-8 BOM. Any text cell starting with `=`, `+`, `-`, `@`, tab or carriage return gets a leading `'`, so spreadsheets show it as text instead of running it as a formula; numbers stay numbers.
- **Images, banner and custom CSS**: an **Image** button in every rich-text editor (intro, question help, answer details, response descriptions), a **Banner** per quiz, and custom CSS site-wide (Settings, Super Admin) and per quiz (quiz settings), with the quiz's CSS overriding the site's. See "Images and custom CSS" below.
- **Copy, export, import and activity**: **Duplicate** a quiz as a draft (from the quiz list or its settings), **Export** a quiz with its images as a `.quiz.json` file and **Import** it here or on another site (always as a new draft), and an **Activity** log of who changed what. See "Copying quizzes and the activity log" below.

See the build order in SPEC.md for what comes next.

## Roles

- **Super Admin:** any email listed in `SUPER_ADMINS` (comma-separated). Checked on every request, never stored. Can do everything, including managing staff, Submissions and Settings.
- **Admin:** invited by a Super Admin on **Admin → Staff**. Can create and edit quizzes.

Anyone else is refused at sign-in. Disabling or removing an Admin signs them out immediately.

## Temporary PIN sign-in

Until Resend is configured, staff can sign in on `/sign-in` with their email plus a PIN (the **Sign in with PIN** card):

- **Admins** each get their own PIN. On **Staff**, a Super Admin clicks **Create PIN** next to the Admin. The PIN (like `ABCD-EFGH-JKMN`) is shown once to pass on; only an scrypt hash is stored. It keeps working until it's reset or revoked, or the Admin is disabled or removed. Resetting or revoking signs that Admin out everywhere. Case, spaces and dashes don't matter when typing it.
- **Super Admins** use the shared `SECRET_PIN` (set it in Vercel, at least 6 characters, and redeploy). It doesn't work for Admins, and an Admin's PIN doesn't work for a Super Admin.

The PIN card shows while `SECRET_PIN` is set or any active Admin has a PIN. PIN sessions last 12 hours. Attempts are limited to 5 per 15 minutes per IP address and 30 per 15 minutes overall, and a wrong PIN, an unknown email or an Admin without a PIN all get the same answer. **Before launch:** click **Revoke all PINs** on Staff, delete `SECRET_PIN` and redeploy; the PIN option disappears.

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

## Screen-reader checklist (manual)

Automated checks can't hear what a screen reader says. Before launch, run the quiz once with
**NVDA + Firefox or Chrome** (Windows) and once with **VoiceOver + Safari** (Mac or iPhone):

1. On the quiz page, the title and introduction are read, then the **Start** button.
2. After Start, you hear "Question 1 of N" and the question; Tab reaches the answers and they are
   read as a radio group (or checkboxes) with the question as the group name.
3. Arrow keys move between radio answers without jumping to the next question, even with
   auto-advance on.
4. Ticking more than the maximum on a multi-select question reads the "You can choose up to…"
   message straight away.
5. On the review screen, each **Change** button says which question it changes.
6. If a required answer is missing when you submit, you land on that question's first answer and
   hear the error.
7. The result page reads the match, its percentage, the runners-up and each category's percentage.
8. With the screen zoomed to 200%, nothing is cut off and there's no sideways scrolling.

## Embedding a quiz

Copy the snippet from the quiz's settings page (Delivery section) into any web page:

```html
<iframe src="https://YOUR-SITE/embed/your-quiz" title="Your quiz" style="width:100%;border:0;min-height:480px" loading="lazy"></iframe>
<script src="https://YOUR-SITE/embed.js" async></script>
```

- The frame grows and shrinks to fit the quiz. The host page receives `quiz:answer`, `quiz:complete` and `quiz:restart` events on the `<iframe>` element, for analytics.
- Inside the frame, progress is tied to a key kept in the browser's local storage, because browsers block cookies in third-party frames.
- Settings → Sites allowed to embed limits which sites may show the frame (empty: any site). Changes take up to a minute to apply. Every other page can only be framed by this site itself.


## Images and custom CSS

**Images** (rich-text editors and the quiz banner):
- PNG, JPEG, WebP or GIF, up to 2 MB. The type is checked from the file's contents. SVG is refused, because it can carry scripts.
- Images are stored in Postgres (`media` table); the same file uploaded twice is stored once. They're served from `/media/{id}` with year-long `immutable` caching, so the database is read about once per image per CDN location.
- Alt text is asked for on insert; leave it empty for a decorative image.
- Rich text may only show this site's own `/media/…` images; anything else is removed when saved. The `/api/v1` responses give full image addresses (`https://…/media/…`) for headless front ends.
- Images that are no longer used aren't cleaned up yet (planned with Phase 14's retention work).

**Banner:** quiz settings → Banner. It's shown above the title on the quiz page, the embed and the shared result page, and is in the API as `quiz.banner` (`{ url, alt, width, height }` or `null`).

**Custom CSS:** Settings → "Site-wide CSS" (Super Admin) and quiz settings → "Quiz CSS". It applies to the quiz page, the embed and the shared result page, never to admin pages. The site-wide CSS comes first and the quiz's after it, so with equal specificity the quiz's rule wins (unless the site's uses `!important`). For safety, CSS can't contain `<`, `@import`, or `url()` addresses on other sites (`/media/…` and `data:` are fine). "Add element" inserts a ready-made rule for any of these stable classes (other class names are internal and may change):

| Element | Selector |
|---|---|
| Whole quiz | `.pltq-quiz` |
| Banner | `.pltq-banner` |
| Quiz title | `.pltq-title` |
| Introduction | `.pltq-intro` |
| Progress bar | `.pltq-progress` |
| Question | `.pltq-question` |
| Question title | `.pltq-question-title` |
| Question help | `.pltq-question-help` |
| Answer | `.pltq-answer` |
| Selected answer | `.pltq-answer[data-selected]` |
| Answer details | `.pltq-answer-details` |
| Error message | `.pltq-error` |
| Buttons | `.pltq-button` |
| Primary button | `.pltq-button--primary` |
| Review screen | `.pltq-review` |
| Result | `.pltq-result` |
| Response (best match) | `.pltq-response` |
| Response title | `.pltq-response-title` |
| Call-to-action button | `.pltq-cta` |
| Runners-up | `.pltq-runners-up` |
| Category profile | `.pltq-profile` |
| Category bar | `.pltq-bar` |
| Site header / footer | `.pltq-site-header`, `.pltq-site-footer` |

The list lives in `src/lib/content/css-hooks.ts`.

## Copying quizzes and the activity log

- **Duplicate** (quiz list or quiz settings → Copy and export) creates "Copy of …" as a draft at `{slug}-copy`, with its categories, questions, answers, responses, weights, settings, banner and CSS. Submissions and sessions are never copied.
- **Export** downloads `{slug}.quiz.json`: the whole quiz with its images embedded, and no database ids. **Import** (Quizzes page) turns a file into a new draft; nothing existing changes. Files are checked like the editors check input: rich text is cleaned again, images go through the same upload checks (no SVG, 2 MB each), and CSS through the same rules. Import files can be up to 4 MB (Vercel's request limit), so a quiz with several large images may need smaller images first.
- **Activity** (`/admin/activity`) lists who changed what and when, filterable by quiz, person, type and date (UTC). Each quiz's settings page shows its recent changes. Admins see quiz changes; Super Admins also see staff, settings and submission changes. PINs, CSS and respondent emails are never written to the log, only that they changed.
