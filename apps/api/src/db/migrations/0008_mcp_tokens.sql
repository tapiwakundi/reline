CREATE TABLE "mcp_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"scope" text DEFAULT 'read' NOT NULL,
	"created_at" timestamp NOT NULL,
	"last_used_at" timestamp,
	"revoked_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "mcp_tokens" ADD CONSTRAINT "mcp_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_tokens_hash_idx" ON "mcp_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "mcp_tokens_user_idx" ON "mcp_tokens" USING btree ("user_id");