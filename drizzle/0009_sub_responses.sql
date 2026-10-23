CREATE TABLE "result_sub_responses" (
	"result_id" integer NOT NULL,
	"sub_response_id" integer NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "result_sub_responses_result_id_sub_response_id_pk" PRIMARY KEY("result_id","sub_response_id")
);
--> statement-breakpoint
CREATE TABLE "sub_response_groups" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sub_response_groups_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"quiz_id" integer NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sub_responses" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sub_responses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"quiz_id" integer NOT NULL,
	"group_id" integer NOT NULL,
	"title" text NOT NULL,
	"description_html" text,
	"url" text,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "sub_response_limit" smallint DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "result_sub_responses" ADD CONSTRAINT "result_sub_responses_result_id_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_sub_responses" ADD CONSTRAINT "result_sub_responses_sub_response_id_sub_responses_id_fk" FOREIGN KEY ("sub_response_id") REFERENCES "public"."sub_responses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_response_groups" ADD CONSTRAINT "sub_response_groups_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_responses" ADD CONSTRAINT "sub_responses_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_responses" ADD CONSTRAINT "sub_responses_group_id_sub_response_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."sub_response_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "result_sub_responses_item" ON "result_sub_responses" USING btree ("sub_response_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sub_response_groups_quiz_name" ON "sub_response_groups" USING btree ("quiz_id",lower("name"));--> statement-breakpoint
CREATE INDEX "sub_responses_quiz_group" ON "sub_responses" USING btree ("quiz_id","group_id","position");--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_sub_response_limit_range" CHECK ("quizzes"."sub_response_limit" between 0 and 20);