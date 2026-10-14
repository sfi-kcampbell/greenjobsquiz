ALTER TABLE "questions" ADD COLUMN "part" text DEFAULT 'scored' NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "extra_answers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_part_valid" CHECK ("questions"."part" in ('pre', 'scored', 'post'));