CREATE TABLE "auth_accounts" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "auth_accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "answer_weights" (
	"answer_id" integer NOT NULL,
	"category_id" integer NOT NULL,
	"weight" numeric(4, 2) NOT NULL,
	CONSTRAINT "answer_weights_answer_id_category_id_pk" PRIMARY KEY("answer_id","category_id"),
	CONSTRAINT "answer_weights_range" CHECK ("answer_weights"."weight" between -5 and 5 and "answer_weights"."weight" <> 0)
);
--> statement-breakpoint
CREATE TABLE "answers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "answers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"question_id" integer NOT NULL,
	"label" text NOT NULL,
	"body_html" text,
	"image_url" text,
	"position" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"quiz_id" integer NOT NULL,
	"name" text NOT NULL,
	"abbr" text NOT NULL,
	"color" text DEFAULT '#4a7c59' NOT NULL,
	"importance" numeric(3, 2) DEFAULT 1 NOT NULL,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "categories_abbr_length" CHECK (char_length("categories"."abbr") between 1 and 6),
	CONSTRAINT "categories_importance_range" CHECK ("categories"."importance" between 0 and 5)
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "questions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"quiz_id" integer NOT NULL,
	"title" text NOT NULL,
	"help_html" text,
	"type" text DEFAULT 'single' NOT NULL,
	"min_select" smallint DEFAULT 1 NOT NULL,
	"max_select" smallint DEFAULT 1 NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"split_multi" boolean DEFAULT false NOT NULL,
	"image_url" text,
	"position" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "quiz_sessions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "quiz_sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"quiz_id" integer NOT NULL,
	"token_hash" char(64) NOT NULL,
	"attempt_no" smallint DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"current_index" smallint DEFAULT 0 NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"submission_id" integer,
	"ip_hash" char(64),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "quizzes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"intro_html" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"scoring_method" text DEFAULT 'cosine' NOT NULL,
	"normalize_per_category" boolean DEFAULT true NOT NULL,
	"runners_up_count" smallint DEFAULT 2 NOT NULL,
	"layout" text DEFAULT 'stepped' NOT NULL,
	"allow_skip" boolean DEFAULT false NOT NULL,
	"show_progress" boolean DEFAULT true NOT NULL,
	"retake_allowed" boolean DEFAULT true NOT NULL,
	"auto_advance" boolean DEFAULT false NOT NULL,
	"delivery_mode" text DEFAULT 'hosted' NOT NULL,
	"headless_base_url" text,
	"layout_template" text DEFAULT 'default' NOT NULL,
	"default_result_id" integer,
	"result_headline" text,
	"structure_version" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quizzes_slug_unique" UNIQUE("slug"),
	CONSTRAINT "quizzes_runners_up_range" CHECK ("quizzes"."runners_up_count" between 0 and 5),
	CONSTRAINT "quizzes_status_valid" CHECK ("quizzes"."status" in ('draft', 'published'))
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"bucket_key" text PRIMARY KEY NOT NULL,
	"tokens" numeric(10, 4) NOT NULL,
	"refilled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "result_weights" (
	"result_id" integer NOT NULL,
	"category_id" integer NOT NULL,
	"weight" numeric(4, 2) NOT NULL,
	CONSTRAINT "result_weights_result_id_category_id_pk" PRIMARY KEY("result_id","category_id"),
	CONSTRAINT "result_weights_range" CHECK ("result_weights"."weight" between -5 and 5 and "result_weights"."weight" <> 0)
);
--> statement-breakpoint
CREATE TABLE "results" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "results_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"quiz_id" integer NOT NULL,
	"title" text NOT NULL,
	"body_html" text DEFAULT '' NOT NULL,
	"excerpt" text,
	"image_url" text,
	"cta_url" text,
	"cta_label" text,
	"position" integer DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"cors_origins" text[] DEFAULT '{}'::text[] NOT NULL,
	"embed_origins" text[] DEFAULT '{}'::text[] NOT NULL,
	"iframe_hosts" text[] DEFAULT '{youtube.com,youtube-nocookie.com,vimeo.com}'::text[] NOT NULL,
	"retention_days" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_single_row" CHECK ("settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "staff_users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "staff_users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"email" text NOT NULL,
	"name" text,
	"role" text DEFAULT 'admin' NOT NULL,
	"invited_by" text,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "submission_answers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "submission_answers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"submission_id" integer NOT NULL,
	"quiz_id" integer NOT NULL,
	"question_id" integer NOT NULL,
	"answer_id" integer NOT NULL,
	"question_title" text NOT NULL,
	"answer_title" text NOT NULL,
	"position" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "submissions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"quiz_id" integer NOT NULL,
	"session_id" integer,
	"token_hash" char(64) NOT NULL,
	"attempt_no" smallint NOT NULL,
	"result_id" integer,
	"result_title" text,
	"raw_similarity" numeric(9, 6),
	"top_category_id" integer,
	"scores" jsonb NOT NULL,
	"ranked" jsonb NOT NULL,
	"answers" jsonb NOT NULL,
	"share_token_hash" char(64),
	"share_expires_at" timestamp with time zone,
	"email" text,
	"questions_answered" smallint DEFAULT 0 NOT NULL,
	"duration_seconds" integer,
	"engine_version" text NOT NULL,
	"suspect" boolean DEFAULT false NOT NULL,
	"ip_hash" char(64),
	"referrer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submissions_shareTokenHash_unique" UNIQUE("share_token_hash")
);
--> statement-breakpoint
CREATE TABLE "auth_users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"email_verified" timestamp,
	"image" text,
	CONSTRAINT "auth_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth_verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "auth_verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_weights" ADD CONSTRAINT "answer_weights_answer_id_answers_id_fk" FOREIGN KEY ("answer_id") REFERENCES "public"."answers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_weights" ADD CONSTRAINT "answer_weights_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD CONSTRAINT "quiz_sessions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_default_result_id_results_id_fk" FOREIGN KEY ("default_result_id") REFERENCES "public"."results"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_weights" ADD CONSTRAINT "result_weights_result_id_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_weights" ADD CONSTRAINT "result_weights_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_answers" ADD CONSTRAINT "submission_answers_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_session_id_quiz_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."quiz_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_result_id_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."results"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "answer_weights_category" ON "answer_weights" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "answers_question_position" ON "answers" USING btree ("question_id","position");--> statement-breakpoint
CREATE INDEX "categories_quiz_position" ON "categories" USING btree ("quiz_id","position");--> statement-breakpoint
CREATE INDEX "questions_quiz_position" ON "questions" USING btree ("quiz_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_sessions_token_quiz_attempt" ON "quiz_sessions" USING btree ("token_hash","quiz_id","attempt_no");--> statement-breakpoint
CREATE INDEX "quiz_sessions_quiz_status" ON "quiz_sessions" USING btree ("quiz_id","status");--> statement-breakpoint
CREATE INDEX "quiz_sessions_expires_at" ON "quiz_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "result_weights_category" ON "result_weights" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "results_quiz_position" ON "results" USING btree ("quiz_id","position");--> statement-breakpoint
CREATE INDEX "submission_answers_submission" ON "submission_answers" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "submission_answers_quiz_question" ON "submission_answers" USING btree ("quiz_id","question_id");--> statement-breakpoint
CREATE INDEX "submission_answers_quiz_answer" ON "submission_answers" USING btree ("quiz_id","answer_id");--> statement-breakpoint
CREATE INDEX "submissions_quiz_created" ON "submissions" USING btree ("quiz_id","created_at");--> statement-breakpoint
CREATE INDEX "submissions_quiz_result" ON "submissions" USING btree ("quiz_id","result_id");--> statement-breakpoint
CREATE INDEX "submissions_quiz_top_category" ON "submissions" USING btree ("quiz_id","top_category_id");--> statement-breakpoint
CREATE INDEX "submissions_email" ON "submissions" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_session" ON "submissions" USING btree ("session_id");