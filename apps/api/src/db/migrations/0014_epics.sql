ALTER TABLE "issues" ADD COLUMN "epic_id" text;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_epic_id_issues_id_fk" FOREIGN KEY ("epic_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issues_epic_idx" ON "issues" USING btree ("epic_id");
