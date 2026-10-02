/**
 * Database schema. See SPEC.md → "Data model".
 *
 * Column names are written in camelCase here and mapped to snake_case in
 * Postgres by the `casing: "snake_case"` option (see client.ts and
 * drizzle.config.ts). Keep the two in sync.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  char,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* -------------------------------------------------------------------------- */
/* Auth.js tables (shape required by @auth/drizzle-adapter)                    */
/* -------------------------------------------------------------------------- */

export const users = pgTable("auth_users", {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text(),
  email: text().unique(),
  emailVerified: timestamp({ mode: "date" }),
  image: text(),
});

export const accounts = pgTable(
  "auth_accounts",
  {
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text().$type<"email" | "oauth" | "oidc" | "webauthn">().notNull(),
    provider: text().notNull(),
    providerAccountId: text().notNull(),
    refresh_token: text(),
    access_token: text(),
    expires_at: integer(),
    token_type: text(),
    scope: text(),
    id_token: text(),
    session_state: text(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("auth_sessions", {
  sessionToken: text().primaryKey(),
  userId: text()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp({ mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "auth_verification_tokens",
  {
    identifier: text().notNull(),
    token: text().notNull(),
    expires: timestamp({ mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/* -------------------------------------------------------------------------- */
/* Staff                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Admins only. Super Admins come from the SUPER_ADMINS env var and are never
 * stored, so this table can't grant or revoke Super Admin.
 */
export const staffUsers = pgTable("staff_users", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  email: text().notNull().unique(), // always stored lowercased
  name: text(),
  role: text().$type<"admin">().notNull().default("admin"),
  invitedBy: text(),
  disabledAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
});

/* -------------------------------------------------------------------------- */
/* Authored content                                                            */
/* -------------------------------------------------------------------------- */

export const quizzes = pgTable(
  "quizzes",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    slug: text().notNull().unique(),
    title: text().notNull(),
    introHtml: text().notNull().default(""),
    status: text().$type<"draft" | "published">().notNull().default("draft"),
    publishedAt: timestamp({ withTimezone: true }),

    scoringMethod: text().$type<"cosine" | "weighted_sum">().notNull().default("cosine"),
    normalizePerCategory: boolean().notNull().default(true),
    runnersUpCount: smallint().notNull().default(2),
    layout: text().$type<"stepped" | "single_page">().notNull().default("stepped"),
    allowSkip: boolean().notNull().default(false),
    showProgress: boolean().notNull().default(true),
    retakeAllowed: boolean().notNull().default(true),
    autoAdvance: boolean().notNull().default(false),
    deliveryMode: text().$type<"hosted" | "headless">().notNull().default("hosted"),
    headlessBaseUrl: text(),
    layoutTemplate: text().$type<"default" | "canvas">().notNull().default("default"),
    defaultResultId: integer().references((): AnyPgColumn => results.id, {
      onDelete: "set null",
    }),
    resultHeadline: text(),
    structureVersion: integer().notNull().default(1),

    createdBy: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("quizzes_runners_up_range", sql`${t.runnersUpCount} between 0 and 5`),
    check("quizzes_status_valid", sql`${t.status} in ('draft', 'published')`),
  ],
);

export const categories = pgTable(
  "categories",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    quizId: integer()
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    name: text().notNull(),
    abbr: text().notNull(),
    color: text().notNull().default("#4a7c59"),
    importance: numeric({ precision: 3, scale: 2, mode: "number" }).notNull().default(1),
    description: text(),
    position: integer().notNull().default(0),
  },
  (t) => [
    index("categories_quiz_position").on(t.quizId, t.position),
    check("categories_abbr_length", sql`char_length(${t.abbr}) between 1 and 6`),
    check("categories_importance_range", sql`${t.importance} between 0 and 5`),
  ],
);

export const questions = pgTable(
  "questions",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    quizId: integer()
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    title: text().notNull(),
    helpHtml: text(),
    type: text().$type<"single" | "multi">().notNull().default("single"),
    minSelect: smallint().notNull().default(1),
    maxSelect: smallint().notNull().default(1),
    required: boolean().notNull().default(true),
    splitMulti: boolean().notNull().default(false),
    imageUrl: text(),
    position: integer().notNull().default(0),
    archivedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("questions_quiz_position").on(t.quizId, t.position)],
);

export const answers = pgTable(
  "answers",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    questionId: integer()
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    label: text().notNull(),
    bodyHtml: text(),
    imageUrl: text(),
    position: integer().notNull().default(0),
    archivedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("answers_question_position").on(t.questionId, t.position)],
);

/** Job Types. */
export const results = pgTable(
  "results",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    quizId: integer()
      .notNull()
      .references((): AnyPgColumn => quizzes.id, { onDelete: "cascade" }),
    title: text().notNull(),
    bodyHtml: text().notNull().default(""),
    excerpt: text(),
    imageUrl: text(),
    ctaUrl: text(),
    ctaLabel: text(),
    position: integer().notNull().default(0),
    archivedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index("results_quiz_position").on(t.quizId, t.position)],
);

/** Sparse: zero weights are never stored. Range −5…+5. */
export const answerWeights = pgTable(
  "answer_weights",
  {
    answerId: integer()
      .notNull()
      .references(() => answers.id, { onDelete: "cascade" }),
    categoryId: integer()
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    weight: numeric({ precision: 4, scale: 2, mode: "number" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.answerId, t.categoryId] }),
    index("answer_weights_category").on(t.categoryId),
    check("answer_weights_range", sql`${t.weight} between -5 and 5 and ${t.weight} <> 0`),
  ],
);

export const resultWeights = pgTable(
  "result_weights",
  {
    resultId: integer()
      .notNull()
      .references(() => results.id, { onDelete: "cascade" }),
    categoryId: integer()
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    weight: numeric({ precision: 4, scale: 2, mode: "number" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.resultId, t.categoryId] }),
    index("result_weights_category").on(t.categoryId),
    check("result_weights_range", sql`${t.weight} between -5 and 5 and ${t.weight} <> 0`),
  ],
);

/* -------------------------------------------------------------------------- */
/* Telemetry                                                                   */
/* -------------------------------------------------------------------------- */

export const quizSessions = pgTable(
  "quiz_sessions",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    quizId: integer()
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    /** HMAC-SHA256 of the visitor token. The raw token is never stored. */
    tokenHash: char({ length: 64 }).notNull(),
    attemptNo: smallint().notNull().default(1),
    status: text().$type<"in_progress" | "completed" | "abandoned">().notNull().default("in_progress"),
    currentIndex: smallint().notNull().default(0),
    answers: jsonb().$type<Record<string, number[]>>().notNull().default({}),
    revision: integer().notNull().default(1),
    submissionId: integer(),
    ipHash: char({ length: 64 }),
    startedAt: createdAt(),
    updatedAt: updatedAt(),
    expiresAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    // One attempt number per token per quiz; restart inserts MAX + 1.
    uniqueIndex("quiz_sessions_token_quiz_attempt").on(t.tokenHash, t.quizId, t.attemptNo),
    index("quiz_sessions_quiz_status").on(t.quizId, t.status),
    index("quiz_sessions_expires_at").on(t.expiresAt),
  ],
);

export const submissions = pgTable(
  "submissions",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    // Restrict: a quiz with submissions must be unpublished, not deleted.
    quizId: integer()
      .notNull()
      .references(() => quizzes.id, { onDelete: "restrict" }),
    sessionId: integer().references(() => quizSessions.id, { onDelete: "set null" }),
    tokenHash: char({ length: 64 }).notNull(),
    attemptNo: smallint().notNull(),
    resultId: integer().references(() => results.id, { onDelete: "set null" }),
    /** Snapshot: survives the result being renamed or deleted. */
    resultTitle: text(),
    rawSimilarity: numeric({ precision: 9, scale: 6, mode: "number" }),
    topCategoryId: integer(),
    /** Snapshots of weights and contributions at submit time. */
    scores: jsonb().notNull(),
    ranked: jsonb().notNull(),
    answers: jsonb().notNull(),
    shareTokenHash: char({ length: 64 }).unique(),
    shareExpiresAt: timestamp({ withTimezone: true }),
    email: text(),
    questionsAnswered: smallint().notNull().default(0),
    durationSeconds: integer(),
    engineVersion: text().notNull(),
    suspect: boolean().notNull().default(false),
    ipHash: char({ length: 64 }),
    referrer: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index("submissions_quiz_created").on(t.quizId, t.createdAt),
    index("submissions_quiz_result").on(t.quizId, t.resultId),
    index("submissions_quiz_top_category").on(t.quizId, t.topCategoryId),
    index("submissions_email").on(t.email),
    uniqueIndex("submissions_session").on(t.sessionId),
  ],
);

export const submissionAnswers = pgTable(
  "submission_answers",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    submissionId: integer()
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    // Denormalized so per-answer aggregates never need a join.
    quizId: integer().notNull(),
    questionId: integer().notNull(),
    answerId: integer().notNull(),
    questionTitle: text().notNull(),
    answerTitle: text().notNull(),
    position: smallint().notNull(),
  },
  (t) => [
    index("submission_answers_submission").on(t.submissionId),
    index("submission_answers_quiz_question").on(t.quizId, t.questionId),
    index("submission_answers_quiz_answer").on(t.quizId, t.answerId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Infrastructure                                                              */
/* -------------------------------------------------------------------------- */

export const rateLimits = pgTable("rate_limits", {
  bucketKey: text().primaryKey(),
  tokens: numeric({ precision: 10, scale: 4, mode: "number" }).notNull(),
  refilledAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

/** Single row (id = 1). */
export const settings = pgTable(
  "settings",
  {
    id: smallint().primaryKey().default(1),
    corsOrigins: text().array().notNull().default(sql`'{}'::text[]`),
    embedOrigins: text().array().notNull().default(sql`'{}'::text[]`),
    iframeHosts: text()
      .array()
      .notNull()
      .default(sql`'{youtube.com,youtube-nocookie.com,vimeo.com}'::text[]`),
    retentionDays: integer(),
    updatedAt: updatedAt(),
  },
  (t) => [check("settings_single_row", sql`${t.id} = 1`)],
);
