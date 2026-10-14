CREATE TABLE "translations" (
	"quiz_id" integer NOT NULL,
	"locale" text NOT NULL,
	"key" text NOT NULL,
	"text" text NOT NULL,
	"source_hash" char(16) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "translations_quiz_id_locale_key_pk" PRIMARY KEY("quiz_id","locale","key")
);
--> statement-breakpoint
ALTER TABLE "quiz_sessions" ADD COLUMN "locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "languages" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "banner_alt_translations" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "locale" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "translations" ADD CONSTRAINT "translations_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;