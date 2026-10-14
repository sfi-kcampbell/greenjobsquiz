CREATE TABLE "quiz_versions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "quiz_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"quiz_id" integer NOT NULL,
	"number" integer NOT NULL,
	"content" jsonb NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_by" text,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD COLUMN "version_id" integer;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "version_id" integer;--> statement-breakpoint
ALTER TABLE "quiz_versions" ADD CONSTRAINT "quiz_versions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_versions_quiz_number" ON "quiz_versions" USING btree ("quiz_id","number");--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD CONSTRAINT "quiz_sessions_version_id_quiz_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."quiz_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_version_id_quiz_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."quiz_versions"("id") ON DELETE set null ON UPDATE no action;