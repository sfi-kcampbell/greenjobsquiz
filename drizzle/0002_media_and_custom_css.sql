CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" integer,
	"content_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"filename" text,
	"sha256" char(64) NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_sha256_unique" UNIQUE("sha256")
);
--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "banner_media_id" uuid;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "banner_alt" text;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "custom_css" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "custom_css" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_quiz" ON "media" USING btree ("quiz_id");--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_banner_media_id_media_id_fk" FOREIGN KEY ("banner_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;