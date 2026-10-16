ALTER TABLE "slack_installations" ADD COLUMN "bot_scopes" text;
--> statement-breakpoint
CREATE INDEX "slack_installations_team_idx" ON "slack_installations" USING btree ("team_id");
