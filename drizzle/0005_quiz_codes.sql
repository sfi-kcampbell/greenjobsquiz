CREATE TABLE "quiz_codes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "quiz_codes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"quiz_id" integer NOT NULL,
	"code" text NOT NULL,
	"label" text,
	"opens_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"report_salt" text NOT NULL,
	"report_hash" char(64) NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "quiz_codes_code_unique" UNIQUE("code"),
	CONSTRAINT "quiz_codes_reportHash_unique" UNIQUE("report_hash"),
	CONSTRAINT "quiz_codes_format" CHECK ("quiz_codes"."code" ~ '^[A-Z0-9]{4,20}$')
);
--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD COLUMN "code_id" integer;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "require_code" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "code_id" integer;--> statement-breakpoint
ALTER TABLE "quiz_codes" ADD CONSTRAINT "quiz_codes_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quiz_codes_quiz" ON "quiz_codes" USING btree ("quiz_id");--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD CONSTRAINT "quiz_sessions_code_id_quiz_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."quiz_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_code_id_quiz_codes_id_fk" FOREIGN KEY ("code_id") REFERENCES "public"."quiz_codes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "submissions_code" ON "submissions" USING btree ("code_id");