CREATE TABLE "audit_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_email" text NOT NULL,
	"scope" text NOT NULL,
	"action" text NOT NULL,
	"quiz_id" integer,
	"quiz_title" text,
	"summary" text NOT NULL,
	"details" jsonb
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_at" ON "audit_events" USING btree ("at");--> statement-breakpoint
CREATE INDEX "audit_events_quiz_at" ON "audit_events" USING btree ("quiz_id","at");--> statement-breakpoint
CREATE INDEX "audit_events_actor" ON "audit_events" USING btree ("actor_email");