# PLT Quiz — Product & Technical Specification

## Context

The product is called a "Quiz" but it's really a personality test: *answer these questions and
we'll recommend a Response*. For PLT/SFI the responses are green careers such as Forester, Wildlife
Biologist, Park Ranger and Environmental Educator.

**Staff** (Super Admins and Admins) build quizzes. For each one they:
- define scoring categories,
- write questions and answers,
- weight each answer against those categories,
- write responses (the outcomes a quiz can recommend), weighted against the same categories.

Answer and result content is rich text and must render well.

**Respondents** are anonymous members of the public. They take a quiz with progress saved, can
restart it later ("things change as people change"), and can print their result.

**Delivery** has three forms:
- a hosted page at `/quizzes/{slug}` with a choice of layouts,
- an embed for other websites,
- a headless option, since an external app may own the experience later.

This is a greenfield project in this repo.

### Decisions

| Decision | Choice |
|---|---|
| Platform | **Vercel** for hosting, functions and cron. **Neon** serverless Postgres |
| Visibility | A quiz is **public as soon as it's published**. Drafts are visible to staff only |
| Staff roles | **Super Admin** (from the `SUPER_ADMINS` env var) and **Admin**. No other roles |
| Respondents | Anonymous. Progress is tied to a session token, with no respondent accounts |
| Scoring | Weighted vectors, best match by **cosine similarity** |
| API | A full public REST API from day one. The hosted page and the embed are clients of it |
| Reporting | Submissions list, detail view, CSV export |
| Headless | The hosted URL **302-redirects** to a per-quiz external base URL |
| Naming | Outcomes are called **Responses** (generic); the PLT quiz's responses are green careers such as Forester |
| Response pages | Not publicly browsable in v1 |
| Build | Full scope, in phases that can each be tested on their own |

### Stack

| Concern | Choice |
|---|---|
| Framework | **Next.js (App Router) + TypeScript (strict)** on Vercel |
| Database | **Neon Postgres** via `node-postgres` (`pg`) with Vercel's `attachDatabasePool`. The pooled connection string is used at runtime and the direct one for migrations. `pg` instead of Neon's HTTP driver gives real interactive transactions and lets local dev and tests use plain Postgres |
| ORM / migrations | **Drizzle ORM + drizzle-kit**. Migrations are checked into the repo and run in the Vercel build step |
| Staff auth | **Auth.js (NextAuth v5)**, using email magic links sent through Resend, with sessions stored in the database *(open decision: alternatively Google sign-in)* |
| Validation | **Zod** at every API and server-action boundary |
| Rich text | **Tiptap** in the admin. Output is sanitized with **`sanitize-html`** at render time |
| Admin UI | React Server Components, server actions, and `dnd-kit` for drag-and-drop reordering |
| Scheduled jobs | **Vercel Cron** calling `/api/cron/*`, protected by `CRON_SECRET` |
| Rate limiting | A Postgres-backed token bucket. Upstash Redis can be added later as a drop-in |
| Tests | **Vitest** for the scoring engine and service logic. **Playwright** for end-to-end flows |
| Previews | Neon branch per Vercel preview deployment (Neon's Vercel integration) |

**Environment variables:** `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `AUTH_SECRET`,
`AUTH_RESEND_KEY`, `EMAIL_FROM`, `SUPER_ADMINS`, `CRON_SECRET`, `TOKEN_PEPPER`, `APP_URL`.

---

## Roles and access

- **Super Admin**: anyone whose email (trimmed, lowercased) is in `SUPER_ADMINS`, a comma-separated
  list. The role is worked out on every request and **never stored**, so editing the env var and
  redeploying is the only way to add or remove one. Super Admins can do everything:
  - edit all quizzes,
  - invite and remove Admins,
  - see Submissions, the detail view and CSV export,
  - change Settings.
- **Admin**: a row in `staff_users` with `role = 'admin'`, invited by a Super Admin. Admins can
  create, edit, publish and unpublish quizzes, categories, questions, answers and responses. They
  can also run Simulate and Health.
- Admins **can't** see Submissions or Settings, and can't manage staff. The reason is that
  submissions hold respondent emails and hashed IPs. *(Confirm this split; it's one flag to change.)*
- **Sign-in is limited** to Super Admin emails and active `staff_users` rows. Anyone else gets "not
  authorized", and no account is created.
- **Every server action and admin API route** calls `requireStaff()` or `requireSuperAdmin()` on
  the server. Hiding a menu item is not access control.
- **The public side has no accounts.** Every published quiz is open to anyone.

---

## Data model (Postgres, via Drizzle)

### Authored content

| Table | Key columns |
|---|---|
| `quizzes` | id, slug (unique), title, intro_html, status (`draft`/`published`), published_at, settings (below), created_by, updated_at |
| `categories` | id, quiz_id → quizzes (cascade), name, abbr (≤6 chars), color, importance numeric (0–5, default 1.0), description, position |
| `questions` | id, quiz_id (cascade), title (plain text), help_html, type (`single`/`multi`), min_select, max_select, required, split_multi (default false), image_url, position |
| `answers` | id, question_id (cascade), label (plain text, required), body_html (optional), image_url, position |
| `results` (Responses) | id, quiz_id (cascade), title, body_html, excerpt, image_url, cta_url, cta_label, position |
| `answer_weights` | (answer_id, category_id) PK, weight numeric(4,2). Both foreign keys cascade |
| `result_weights` | (result_id, category_id) PK, weight numeric(4,2). Both foreign keys cascade |
| `media` | id (uuid), quiz_id (set null), content_type (png/jpeg/webp/gif), bytes (bytea, ≤ 2 MB), byte_size, width, height, filename, sha256 (unique: stored once), created_by, created_at |
| `staff_users` | id, email (unique, lowercased), name, role (`admin`), invited_by, disabled_at, pin_hash (scrypt, temporary PIN sign-in), pin_set_at, created_at |
| `audit_events` | id, at, actor_email, scope (`quiz`/`staff`/`settings`/`submissions`; Admins see `quiz` only), action (e.g. `question.update`), quiz_id (set null), quiz_title (as it was), summary, details (jsonb; never PINs, CSS or respondent emails) |
| `quiz_codes` | id, quiz_id (cascade), code (unique, `A–Z0–9` 4–20, stored upper case), label, opens_at, closes_at (exclusive; whole UTC days), report_salt + report_hash (teacher link = HMAC of id and salt; a new salt revokes it), created_by, created_at, archived_at. `quiz_sessions.code_id` and `submissions.code_id` (set null) record the code; `quizzes.require_code` makes one necessary for new attempts |
| Auth.js tables | users, accounts, sessions, verification_tokens (the standard Drizzle adapter) |

**Answers get their own rows** rather than an array on the question, because IDs must be permanent.
If they were stored as an array, reordering would shift the indexes, and every past submission
pointing at "answer 2" would quietly start meaning something else.

**Weights live in join tables with cascading foreign keys.** Deleting a category then removes its
weights automatically, so orphaned keys can't skew scoring. The rules for weights:
- rounded to 2 decimal places,
- clamped to **−5…+5**,
- stored only when non-zero.

Negative weights are deliberate: "I hate being cold" should count *against* Forester. The UI labels
the scale from −5 (strongly against) to +5 (strongly for).

**Quiz settings**, stored as columns:

| Setting | Values or default |
|---|---|
| scoring_method | `cosine` \| `weighted_sum`, default `cosine` |
| normalize_per_category | default true |
| runners_up_count | default 2, clamped 0–5 |
| layout | `stepped` \| `single_page` |
| allow_skip, show_progress, retake_allowed | on/off |
| auto_advance | default false |
| delivery_mode | `hosted` \| `headless` |
| headless_base_url | URL |
| layout_template | `default` \| `canvas` |
| default_result_id | fallback result when the respondent's vector is all zero |
| result_headline | text |
| banner_media_id, banner_alt | the banner image (→ media, set null) and its alt text (empty: decorative) |
| custom_css | the quiz's CSS (≤ 50,000 characters); `settings.custom_css` holds the site-wide CSS |
| structure_version | increments on every content save; used for the cache key and ETag |

**Publishing:** only `published` quizzes are served publicly. Drafts return 404 to the public.
Staff can preview drafts through `/admin/quizzes/{id}/preview`. Unpublishing never touches existing
submissions.

**Soft delete:** archive any question, answer or result that already has submissions instead of
deleting it. History is safe either way, because submissions keep snapshots.

### Telemetry

**`quiz_sessions`**
- Columns: id, quiz_id, token_hash char(64) unique, attempt_no, status
  (`in_progress`/`completed`/`abandoned`), current_index, answers jsonb, revision int default 1,
  submission_id, ip_hash, started_at, updated_at, expires_at.
- Indexes: (quiz_id, status), expires_at, token_hash.

**`submissions`**
- Columns: id, quiz_id, session_id, token_hash, attempt_no, result_id, result_title,
  raw_similarity numeric(9,6), top_category_id, scores jsonb, ranked jsonb, answers jsonb,
  share_token_hash char(64) unique, share_expires_at, email (optional, only if the respondent
  enters it), questions_answered, duration_seconds, engine_version, suspect bool, ip_hash,
  referrer, created_at.
- Indexes: (quiz_id, created_at), (quiz_id, result_id), (quiz_id, top_category_id), email.

**`submission_answers`**
- Columns: id, submission_id, quiz_id, question_id, answer_id, question_title, answer_title,
  position.
- Indexes: submission_id, (quiz_id, question_id), (quiz_id, answer_id).
- A multi-select question produces several rows with the same question_id.

**`rate_limits`**: (bucket_key) PK, tokens, refilled_at.

**`settings`**: a single row. Holds the CORS origin allow-list, retention days, the iframe host
allow-list, and the embed allowed origins.

Three properties of this schema are load-bearing:

1. **Tokens are stored only as HMAC-SHA256(token, `TOKEN_PEPPER`).** That applies to both session
   tokens and share tokens. A database leak then doesn't hand out live sessions or share links.
2. **`result_title`, `question_title` and `answer_title` are snapshots.** The source rows can be
   renamed or deleted and the history still holds.
3. **`scores` and `answers` capture each answer's weights and contributions at submit time.** If
   the detail view were rendered from the *current* weights, history would be misreported after
   any retune.

`submission_answers` exists as a table so that "what percentage picked each answer to Q7?" is an
indexed `GROUP BY`. `quiz_id` is denormalized onto it so those aggregates don't need a join.

---

## Scoring engine

`src/lib/scoring/` is **pure TypeScript**: no database, no fetch, no Next.js imports, no globals.
Data goes in and data comes out. The caller loads the data.

```ts
score(selections, results, categories, options): ScoreResult
buildUserVector(selections, categories, options): Record<CatId, number>
normalize(vec)          // L2
cosine(aUnit, bUnit): number
rank(userUnit, results, options)
toPercentage(cos): number
```

Vector keys are always category IDs.

### Aggregation

1. **Dedupe** by `(questionId, answerId)`.
2. **Single questions:** if a `single` question has more than one answer, keep the first and warn
   `multiple_answers_single_question`.
3. **Per question:** `contribution[cat] = Σ answer.weights[cat] × category.importance`. If
   `split_multi` is on, divide by the number of answers selected.
4. **Total:** sum across questions into a vector that starts at 0 for every category.
5. **Bad weights:** treat non-finite weights as 0 and warn.
6. **Unknown categories:** drop them and warn `unknown_category`. The dimensions must be fixed.

`split_multi` defaults to **off**, because authors think additively.

### Cosine plus two normalizations

**Why not a plain weighted sum:** it has a result-side magnitude bias. A "generalist" response that
is weighted high in every category beats every specialist. Cosine measures the *shape* of the
profile instead. Its range is [−1, 1], and a negative value genuinely means a poor fit.

**1. Per-category max-achievable normalization (default on).** If 11 answers feed Outdoors and only
3 feed Policy, Outdoors dominates and the quiz "always says Forester". Fix this by dividing each
category score by the most that category can score in this quiz. Show those maximums in Health.

**2. L2-normalize both vectors, then take the dot product** in a fixed category order. Partial
completion stays meaningful, so a mid-quiz preview comes for free.

**`dropUnreachable` (default on).** Find the reachable categories from *all* answer weights in the
quiz, not only the ones selected. Drop unreachable categories from both vectors before normalizing,
and warn `unreachable_category`.

**Never shift negative values into positive space.** Shifting changes the angles and destroys the
opposite-fit signal.

### Match percentage

```
angle = 1 − acos(clamp(cos, −1, 1)) / (π/2)
pct   = clamp(round(100·angle), 1, 99)   // 100 only when cos ≥ 0.9999
```

Sanity check: cos .95 → 80%, .80 → 59%, .70 → 49%, 0 → 0%.

As built: the percentage is held between 0 and 99 (not 1–99), so that cos ≤ 0 reads as 0%, consistent with the check values above.

- Store only `raw_similarity`. That keeps the display formula changeable without a migration.
- Return `isClose = best.raw − second.raw < 0.02` so the UI can say "a strong fit for both…".

### Tie-break order (deterministic)

1. Higher raw similarity (ε = 1e-9)
2. Higher un-normalized dot product
3. More overlapping non-zero categories
4. Lower position
5. Lower id

### Return value and edge cases

```ts
{ status: 'scored'|'insufficient_data'|'no_results', engine: '1',
  vector, unit, match: Match|null, ranked: {resultId, raw, percent, overlap}[],
  isClose, isFallback?, warnings: {code, context}[] }
```

- **No results:** return `no_results` with HTTP 200 and a friendly message. Staff see the reason.
- **All-zero user vector:** return `insufficient_data`. Never invent a winner. If
  `default_result_id` is set, return it with `isFallback`.
- **All-zero result vector:** exclude it and warn `empty_weight_vector`. Show it in admin as "N job
  types can never be recommended".
- **Only one result:** it wins, with an honest percentage.

### Tests (Vitest)

These are the highest-value tests in the project. Cover:
- hand-computed cosine fixtures,
- negative weights,
- an all-zero user vector,
- no results,
- an empty result vector,
- unreachable categories, with the option on and off,
- `split_multi` on and off,
- every tie-break rung,
- dedupe,
- non-finite weights.

---

## Sessions and progress (anonymous)

### Identity

- **Token:** 32 random bytes from `crypto.randomBytes`, hex-encoded. Only its HMAC is stored.
- **Hosted page:** an `HttpOnly`, `Secure`, `SameSite=Lax` cookie `pltq_visitor`, valid 180 days.
  The 180 days matter because "resume later" is a headline requirement.
- **Header:** the token is also returned as `sessionKey` and accepted back in `X-Quiz-Session`. The
  server resolves identity from the **header first, then the cookie**. This is what makes the embed
  and headless clients work, since they can't rely on cookies.
- **Cookie scope:** cookies are only set on API responses, never on cached HTML.

### Writes: one per answer

Every answer is saved as it's made, because people abandon a quiz by closing the tab.
- The client debounces 250 ms and collapses quick multi-select toggles into one write per question.
- It sends only the question that changed.
- A batch endpoint exists only for the `sendBeacon` flush on unload.

**Rows are created lazily.** `GET /session` with no identity returns `{status:'none'}` and creates
nothing, so crawlers create no rows. The row, cookie and `sessionKey` are created on the **first
answer save**.

**Concurrency:** each session has a `revision` counter. If the client's `clientRevision` doesn't
match (two tabs, or a back-button replay), the server **still applies the write**; last-write-wins
per question is safe. It responds with `stale: true` plus the full answer set, so the client
reconciles silently. Updates run as a single `UPDATE … SET revision = revision + 1 … RETURNING`.

### Resume and restart

`GET /quizzes/{id}/session` returns
`{status, sessionKey?, revision, answers, currentIndex, answeredCount, total, submission?}`.

A returning respondent sees a resume prompt: "You're 7 of 20 through. **Resume** / **Start over**."

**Restart creates a new attempt.** It never wipes:
- The current `in_progress` row is set to `abandoned`.
- A new row is inserted with `attempt_no = MAX + 1` for the same token.
- Submissions are append-only.
- If an empty `in_progress` row was created in the last 5 seconds, return that row instead. That
  makes a double-clicked Restart idempotent.

Attempt history becomes a feature: you can see Park Ranger → Wildlife Biologist over time. With
anonymous identity, that history lasts as long as the visitor token does.

### Daily cleanup (Vercel Cron → `/api/cron/gc`)

- Delete empty `in_progress` sessions older than 2 days.
- Mark sessions with answers `abandoned` after 90 days. Delete `abandoned` sessions after 180 days.
- **Never delete submissions automatically.** Super Admins get a purge tool, and retention is a
  setting.
- Delete in batches of 1,000 inside the function time limit. All thresholds are configurable.

### Caching rules

1. **No user-specific data in cacheable HTML.** Quiz pages render the title, intro and an empty
   client container. All state comes from the API.
2. **Quiz structure is the same for everyone.** Serve it with
   `CDN-Cache-Control: public, s-maxage=300, stale-while-revalidate=600` for the CDN,
   `Cache-Control: public, max-age=0, must-revalidate` for browsers, and an ETag built from
   `structure_version`. Invalidate with `revalidateTag('quiz:{id}')` on every content save or
   publish.
3. **Session, submit and result routes** send `Cache-Control: no-store, private` and run
   dynamically (`export const dynamic = 'force-dynamic'`).
4. **CDN warning, in the README.** If anyone puts another CDN in front of Vercel, `/api/v1/*session*`,
   `/submit` and `/results/*` must be excluded from caching. A cached `/session` response means
   visitor A sees visitor B's progress, and that's the biggest production risk.

---

## Public REST API (`/api/v1`, Next.js route handlers)

Every input is parsed with Zod. Errors look like `{error: {code: 'quiz_*', message}}` with an
explicit HTTP status.

| Method | Route | Notes |
|---|---|---|
| GET | `/quizzes` | Published quizzes only: id, slug, title |
| GET | `/quizzes/{id}` and `/quizzes/by-slug/{slug}` | Published structure. Cacheable, with ETag |
| GET | `/quizzes/{id}/session` | **Creates nothing.** `no-store` |
| PUT | `/quizzes/{id}/session/answer` | Creates the session on first write |
| POST | `/quizzes/{id}/session/answers` | Batch. Also accepts `sessionKey` in the body, for `sendBeacon` |
| POST | `/quizzes/{id}/session/restart` | New attempt. Idempotent within 5 s |
| POST | `/quizzes/{id}/submit` | Scores, stores and returns a share token. Idempotent per session |
| GET | `/results/{token}` | The token is the credential. `no-store`, `X-Robots-Tag: noindex` |
| GET | `/quizzes/{id}/attempts` | Attempt history for the current token |

**Admin operations are not part of the public API.** They're server actions and `/api/admin/*`
routes behind `requireStaff()`:
- CRUD, reorder and seed,
- publish,
- simulate,
- report (Super Admin),
- export (Super Admin).

**Argument rules:**
- The quiz must be published.
- `questionId` must belong to that quiz, checked against the server-side structure.
- Every `answerIds` entry must belong to that question, and the count must respect min, max and a
  cap of 50. **An empty array is legal and means skipped or cleared.**
- Tokens must match `^[a-f0-9]{32,64}$`.
- Bodies are capped at 64 KB.

**Non-negotiable:** the public structure payload never contains answer weights, now or later. All
scoring happens on the server.

**Result payload**

```
{ id, quiz:{id,title,slug}, createdAt, attemptNo, status,
  match:{resultId,title,bodyHtml,imageUrl,percent,raw},
  runnersUp:[{resultId,title,excerptHtml,percent,raw}],
  scores:{[catId]:{raw,normalized,label,color}},
  isClose, shareUrl, printUrl }
```

**Rich HTML** is sanitized with `sanitize-html` on output, against a fixed allow-list. `<iframe>` is
allowed only when its `src` host is in the settings list (default: youtube.com,
youtube-nocookie.com and vimeo.com), so career videos work.

**Write protection** (no accounts, so no CSRF tokens):
- Every write needs the session token. The first write needs none, because it creates the session.
- Rate limiting (below).
- For cookie-authenticated requests, an `Origin` check against `APP_URL` and the allow-listed
  origins.
- **Accepted residual risk:** the worst a forged anonymous write can do is change a stranger's quiz
  answers. That involves no privilege, no PII and no money.

**CORS and headless:** allow-listed origins only, echoed back with `Vary: Origin`. **Never `*` with
credentials.** Headless and embed clients identify themselves with `X-Quiz-Session`.

**Rate limits** (token bucket keyed on hashed IP and on token hash):

| Action | Limit |
|---|---|
| Submit | 10/hr |
| Restart | 20/hr |
| Answer saves | 300/hr |
| Structure reads | Uncapped |

Over the limit, return 429 with `Retry-After`. A submit less than 3 seconds after the session was
created is flagged `suspect`, never rejected.

---

## Admin UX (`/admin`)

### Navigation

Quizzes · Responses (filtered by quiz) · Submissions (Super Admin) · Staff (Super Admin) · Settings
(Super Admin).

The quiz list shows status (Draft/Published), a **Publish/Unpublish** toggle, **Open Builder**, and
**Preview**.

### Staff screen (Super Admin)

- **Super Admins:** listed read-only, labelled "from SUPER_ADMINS".
- **Admins:** a table with invite by email (sends the magic link), disable and re-enable, and
  remove.
- **Guard:** a Super Admin email can't be added as an Admin. It's already a Super Admin.

### Builder: one screen, saved per item

`/admin/quizzes/{id}/builder` has tabs: **Categories | Questions | Responses | Simulate | Health**.

- **Why not one page per question or answer:** a 30-question quiz would take about 180 page loads,
  and nobody could compare weights side by side.
- **Why not one giant form:** a single failure loses everything.

Each card saves through its own server action. A dirty flag per card drives a persistent "Unsaved
changes in 2 questions" bar with **Save all**, which saves cards one at a time. A `beforeunload`
warning fires while anything is dirty.

### Categories tab

- Opens first on a new quiz.
- **"Start with a suggested set"** seeds Outdoors, Analytical, People-facing, Hands-on, Creative,
  and Policy & Advocacy.
- Table columns: drag handle · Name · Abbr (defaults to the first 4 characters) · Color · Importance
  (0–5) · Used by · Delete.
- Delete confirms with impact counts: "Outdoors is used by 14 answers and 5 responses."
- Warn above 8 categories. Hard-stop at 15.

### Questions tab: accordion cards with a weight matrix

```
┌ ⠿ 2.  "How do you feel about writing reports?"        single · 3 answers   [▲] [⋮] ┐
│  Question text  [_______________________________________________]                  │
│  Type [single ▾]   ☑ Required        Help text (rich)  [▸ expand]                   │
│                                                                                     │
│  Answers                          Outdo  Analy  Peopl  Hands  Creat  Polic   Total  │
│  ⠿ [Love them, spreadsheets…]  ▸  [ 0 ]  [ 3 ]  [ 0 ]  [ 0 ]  [ 0 ]  [ 2 ]    5    │
│  ⠿ [I'd rather be outside___]  ▸  [ 3 ]  [-1 ]  [ 0 ]  [ 2 ]  [ 0 ]  [ 0 ]    4    │
│  ⠿ [Only if someone reads it]  ▾  [ 0 ]  [ 1 ]  [ 3 ]  [ 0 ]  [ 1 ]  [ 0 ]    5    │
│     ┌ Rich body (optional) ───────────────────────────────────┐                     │
│     │  [ Tiptap:  B  I  •  1.  link  image  embed ]           │                     │
│     └─────────────────────────────────────────────────────────┘                     │
│  [+ Add answer]                        Column totals:  3    3     3     2   1   2   │
│                                       [Delete question]      [Save question]  ●     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

- **Matrix layout:** answers are rows and categories are columns, with row and column totals.
  - Column headers show the abbreviation, with the full name as a tooltip and the category color as
    a top border.
  - The header row is sticky. Above 8 categories, the label column stays pinned.
- **Cells** are numeric inputs from −5 to 5, with zeros shown muted. Arrow keys move between cells,
  and Shift+↑/↓ changes the value.
- **Answer label** is required plain text, and is also the reporting/CSV label. The **rich body**
  is an optional drawer, collapsed by default; its arrow shows filled when a body exists.
- **Cards start collapsed.** Tiptap mounts only when a card is opened. Expanded state is remembered
  in `sessionStorage`.
- **Reordering** uses `dnd-kit` for both questions and answers. On drop, the client sends the
  ordered IDs, and the server checks parentage and renumbers every position from 0 in one
  transaction.
- **New answers** are created when the question is saved, not when they're added.
- **Rich text** is stored as sanitized HTML, and image uploads go to **Vercel Blob**.

### Responses tab

- **Matrix:** results × categories, sharing the matrix component with the Questions tab.
- **Per-row helper:** "normalize to sum 10".
- **Near-duplicate flag** on any pair of results with nearly identical vectors. Coin-flip matches
  are the top source of "wrong answer" complaints.
- **Response editor:** title, rich body, excerpt, image, CTA, and a Category Profile with live bars.

### Simulate tab

- **Live scoring:** pick answers to see the category vector as bars, plus the ranked results with
  scores, from the same scoring module production uses. As built, the engine runs in the admin's
  browser (staff only), so results update instantly; the public API still never sends weights.
- **Reverse search:** "Find answers that produce Forester" runs a greedy search.
- **Why it matters:** the scoring model can be built and signed off before the public frontend
  exists.

### Health tab

Checks run on the quiz, each with a link to the problem:
- no categories,
- a question with fewer than 2 answers,
- an answer whose weights are all zero,
- a question where every answer has the same vector,
- a result whose weights are all zero,
- fewer results than `runners_up_count + 1`,
- near-duplicate results,
- an unused category,
- the max achievable score per category.

Health only warns; it never blocks. Publishing shows the warning count ("Publish anyway? 3 health
warnings").

---

## Submissions and export (Super Admin)

**List columns:** Attempt # · Date (newest first) · Quiz · Respondent (email if one was given,
otherwise "Anonymous") · Matched Response · Score (with a bar) · Top Category · Answered (12/12) ·
Time.

**Actions:**
- View and Delete on each row.
- Bulk Delete and Export.
- Server-side pagination and sorting, with the state kept in the URL.

**Filters:** quiz, response (limited to the chosen quiz), date range, and text search over email and
result title.

**Query safety:**
- All queries go through Drizzle parameters, including limit and offset.
- LIKE terms are escaped.
- Sort columns come from a hard-coded allow-list; direction is `asc` or `desc` only.

**Detail view** has four panels:

| Panel | Contents |
|---|---|
| Header | Quiz, date, duration, referrer, truncated ip_hash |
| Match | The winner, then runners-up with the **gap to first place** |
| Category profile | Raw, normalized and max score per category |
| Transcript | Snapshot titles, each answer's **stored** contribution, and the current rich body labelled "current content" |

**CSV export** is a route handler that streams a `ReadableStream`:
- **Access:** Super Admin check first, using the same filters as the list.
- **Rows:** fetched in batches of 500 so memory stays flat.
- **Format:** a UTF-8 BOM, `nosniff`, and `Content-Disposition` with a sanitized filename.
- **Formula-injection guard on every cell:** prefix `'` if the value starts with any of
  `= + - @ \t \r`. Cells are not HTML-escaped; add a comment saying so.
- **Wide mode:** one row per attempt, plus raw and normalized columns per category. It requires a
  quiz filter.
- **Long mode:** one row per submission × question. Bodies are stripped of HTML and truncated at
  32,000 characters.
- **Vercel limit:** if exports outgrow the function time limit, move to a background job that
  writes to Vercel Blob. That's not needed in v1.

---

## Respondent experience

### Client (a React client component, shared by the hosted page and the embed)

The client has six internal parts:

| Part | Role |
|---|---|
| Api | A `fetch` wrapper that adds `X-Quiz-Session` and normalizes errors |
| Store | A small reducer: `{quiz, answers, index, revision, status, submission, pending, error}` |
| Queue | The optimistic-save outbox |
| Views | Intro, ResumePrompt, Question, Review, Result, Error, Progress |
| Controller | The state machine |
| A11y | Announce and focus helpers |

**States:** `loading → intro → (resume_prompt) → question(i) → (review) → submitting → result`, plus
`error` with a retry. `loading` fetches structure and session in parallel, which keeps the structure
cacheable. The submit button is disabled while a submit is in flight, and the server is idempotent
too.

- **Layouts:** `stepped` (the default) and `single_page`.
- **Progress bar:** `role="progressbar"` with aria values and visible "7 of 20" text. It counts
  answered questions, not the current position.
- **Optimistic saves:**
  - The UI never waits on the network.
  - The queue runs one request at a time and dedupes by question.
  - The queue is mirrored to `sessionStorage`.
  - Retries back off at 1, 2, 4, 8, 16 and 30 seconds, for up to 6 tries.
  - After that, a non-blocking "couldn't save — Retry" banner appears.
- **Leaving the page:** `sendBeacon` flushes the queue on unload. A `pageshow` with `persisted`
  (back/forward cache) triggers a session re-fetch.
- **Auto-advance** is off by default, and the Next button is always shown.

**Accessibility:**
- Real `<fieldset>`/`<legend>` elements, native radio and checkbox inputs, and `<label>`. No div
  radiogroups.
- At max_select, nothing is disabled. Show an inline message and announce it.
- On question change, focus moves to the question container (`tabindex=-1`).
- A single polite live region announces "Question 8 of 20". The step itself is not `aria-live`.
- Errors use `aria-invalid` and `aria-describedby`. On submit, focus goes to the first missing
  answer.
- Enter means Next. Focus rings stay visible.
- Selected state never relies on color alone, contrast is at least 4.5:1, and
  `prefers-reduced-motion` is respected.

**Rich HTML:** only the server-sanitized intro, question, answer and result bodies use
`dangerouslySetInnerHTML`; everything else is plain text. Off-site links get
`target="_blank" rel="noopener noreferrer"`. Rich HTML is never put inside a `<label>`.

**Events:** the client emits `quiz:answer`, `quiz:complete` and `quiz:restart` as DOM CustomEvents
(and as `postMessage` when embedded) for analytics.

### Hosted page

- **Quiz page:** `/quizzes/{slug}` is published only, statically rendered (title and intro), and
  revalidated by tag. Layout templates are `default` (site header and footer) and `canvas`
  (distraction-free), chosen per quiz from a fixed list.
- **Index:** `/quizzes` lists every published quiz.
- **Headless mode:** a quiz with `delivery_mode = headless` gets a temporary redirect (Next.js sends 307, which keeps the method) to
  `{headless_base_url}/quizzes/{slug}` (done in middleware or the page). If no base URL is set it
  returns 404.
- **No JSON here:** these human URLs never serve JSON. JSON lives under `/api/v1`.

### Embed

The snippet is `<iframe src="{APP_URL}/embed/{slug}">` plus a tiny `embed.js` that auto-resizes the
iframe through `postMessage`.

Inside the iframe the session key is kept in `localStorage` and sent as `X-Quiz-Session`, because
third-party cookies are blocked. The CSP `frame-ancestors` directive is built from the embed's
allowed origins in Settings, and the default allows all.

### Print and share

- **Print in place:** a print stylesheet hides the actions and chrome, prints black on white, avoids
  breaks inside cards, appends link URLs, and uses `print-color-adjust: exact`. **Every bar always
  has a text percentage next to it.**
- **Printer-friendly route:** `/quiz-result/{token}` is a minimal standalone page with
  `?autoprint=1`. It sends `no-store` and is noindexed through both a header and a meta tag.
- **Share token:** 128 random bits, returned once, stored only as an HMAC, and revocable. Submission
  IDs never appear in public URLs.
- **Share card:** `/quiz-result/{token}/card`, a 1200×630 PNG (`next/og` `ImageResponse`, Geist from
  `assets/fonts`) with the banner (PNG/JPEG), the best match, its percentage (not for fallbacks) and the
  top three categories. It's the share page's `og:image` and `twitter:image` (`summary_large_image`), is
  offered as **Download image**, and is `shareImageUrl` in the API. Same headers and revocation as the share page.
- **PDF:** no server-side PDF library. The browser's "Save as PDF" on the print route is the PDF
  feature. A v1.1 idea is "Email me my results" through Resend.

### Images, banner and custom CSS

- **Uploads:** `POST /api/admin/media` (staff, multipart `file`). The type comes from magic bytes
  (PNG, JPEG, WebP, GIF; never SVG), 2 MB maximum, deduplicated by sha256.
- **Serving:** `GET /media/{id}` with `Cache-Control: public, max-age=31536000, immutable`,
  `nosniff`, `Content-Disposition: inline` and a `default-src 'none'; sandbox` CSP.
- **Rich text:** the sanitizer keeps `<img>` only with `src="/media/{uuid}"`, `alt`, `width` and
  `height`. API responses rewrite `/media/…` to the request's own origin.
- **Banner:** shown above the title on the hosted page, the embed and `/quiz-result/{token}`;
  `quiz.banner` in the API.
- **Custom CSS:** site-wide (`<style id="pltq-site-css">`) then the quiz's
  (`<style id="pltq-quiz-css">`), on respondent pages only. Validation refuses `<`, `@import`,
  `expression()`, `javascript:`, `behavior`, `-moz-binding`, and addresses on other sites in
  `url()` or strings (checked after resolving CSS escapes). The stable `pltq-*` hooks are listed
  in `src/lib/content/css-hooks.ts` and the README.

---

## Privacy

- **No raw IPs:** only `ip_hash`, an HMAC with the pepper.
- **Email:** collected only if the respondent chooses to give it.
- **Retention:** a configurable retention period, with a purge in the daily cron. The cookie
  lifetime is configurable too.
- **Data requests:** a Super Admin tool to export or erase a respondent's data by email or by share
  token.
- **Policy text:** a "what we store" paragraph ready for the privacy policy.

---

## Repository layout

```
greenjobsquiz/
├── drizzle/                     migrations (generated, committed)
├── drizzle.config.ts
├── vercel.json                  cron schedule
├── src/
│   ├── app/
│   │   ├── quizzes/[slug]/      hosted quiz page (+ index at quizzes/)
│   │   ├── quiz-result/[token]/ printable result
│   │   ├── embed/[slug]/        iframe embed page
│   │   ├── admin/               dashboard, quizzes, builder, responses, submissions, staff, settings
│   │   └── api/
│   │       ├── v1/              public REST routes
│   │       ├── admin/           simulate, report, export
│   │       ├── cron/gc/         cleanup
│   │       └── auth/[...nextauth]/
│   ├── lib/
│   │   ├── db/                  schema.ts, client.ts (Neon serverless)
│   │   ├── auth/                Auth.js config, requireStaff/requireSuperAdmin, SUPER_ADMINS parsing
│   │   ├── scoring/             PURE engine + *.test.ts
│   │   ├── content/             compiled-quiz loader, cache tags
│   │   ├── sessions/            tokens, repository, service
│   │   ├── rate-limit/
│   │   ├── sanitize/            sanitize-html config, iframe allow-list
│   │   └── export/              CSV streaming + cell guard
│   └── components/
│       ├── quiz/                respondent client
│       └── admin/               matrix, accordion, editors
├── public/embed.js
├── e2e/                         Playwright
└── SPEC.md
```

---

## Build order

| Phase | What gets built | How to verify |
|---|---|---|
| **0** Skeleton | Next.js app, Neon + Drizzle schema and migrations, Auth.js magic link, `SUPER_ADMINS` parsing, admin shell, Staff screen, Vercel deploy | Super Admin can sign in; an invited Admin can sign in; a random email is rejected; Admins can't see Submissions or Staff |
| **1** Categories | CRUD, reorder, suggested set | Add, rename, reorder and delete; deleting cascades the weights |
| **2** Questions and answers | Accordion, matrix, Tiptap drawers, lazy answers, two-level dnd, dirty state | Build a 10-question quiz; drag a question and its editor still works |
| **3** Responses | Editor, profile bars, matrix, near-duplicate flag | Write 5 distinct responses |
| **4** Scoring | Pure engine, Vitest suite, Simulate, Health | **Milestone:** the model can be tuned with no frontend. Get sign-off here |
| **5** Public API | Tokens, sessions, all `/api/v1` routes, publish gating | **Milestone:** the whole flow works with curl; drafts return 404 |
| **6** Frontend happy path | Hosted page, single-select through to the result | First demo |
| **7** Full frontend | Multi-select, validation, review, progress, restart, resume | Complete, restart, complete again |
| **8** Accessibility | Keyboard and screen-reader pass, before any polish | Full run with keyboard only, then NVDA or VoiceOver |
| **9** Resilience | Retry queue, sendBeacon, bfcache, rate limits | Go offline mid-quiz and recover |
| **10** Delivery | Layouts, `/quizzes` index, headless 302, embed with CORS | Embed on another origin; switch a quiz to headless |
| **11** Print and share | Print CSS, print route, share tokens | Print the result; open a share URL in a fresh browser |
| **12** Submissions | List, filters, detail | Uses the data from phase 7 |
| **13** Export | Both CSV modes with the injection guard | A `=cmd` label stays inert in Excel |
| **14** Hardening | Settings, privacy tools, retention cron, README | Re-run the anonymous flow in two browsers at once on production |

## End-to-end verification

1. **Scoring tests:** `npm test` (Vitest) passes.
2. **Build:** a Super Admin builds a 10-question, 6-category, 5-response quiz. An Admin edits it.
   The Admin can't open Submissions.
3. **Tune and publish:** Simulate gives a sensible ranking and Health is clean. Before publishing
   the public URL returns 404; after publishing it loads.
4. **Resume:** take the quiz anonymously, close the tab at Q5, reopen it, and the resume prompt
   shows the right count.
5. **Complete:** finish the quiz. Check the result, the runners-up and the bars. Print it, open the
   print route, and open the share URL in a fresh profile.
6. **Restart:** a second attempt exists and the first submission survives.
7. **Embed and headless:** embed on another origin and complete the quiz there. Switch to headless
   and you get a 302.
8. **Submissions and export:** filter, open the detail, and confirm the stored contributions match
   Simulate. Export both CSV modes.
9. **Isolation:** run two browsers at once on the production deployment. Neither sees the other's
   progress, and session responses carry `no-store`.
10. **Unpublish:** the public URL returns 404 and the submissions remain.

## Open decisions

- **Staff sign-in method:** magic link through Resend (the recommendation, and it needs a Resend
  account and a verified sending domain) or Google sign-in.
- **Admin access to Submissions:** currently Super Admin only.
- **Iframe allow-list** for career videos: confirm the hosts with the content team.
