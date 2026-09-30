ALTER TABLE "workspaces" ADD COLUMN "slug" text;--> statement-breakpoint
UPDATE "workspaces"
SET "slug" = trim(both '-' from regexp_replace(lower(regexp_replace("name", '[^a-zA-Z0-9]+', '-', 'g')), '-+', '-', 'g'));--> statement-breakpoint
UPDATE "workspaces" SET "slug" = 'workspace' WHERE "slug" IS NULL OR "slug" = '';--> statement-breakpoint
UPDATE "workspaces" w
SET "slug" = w."slug" || '-' || substr(w."id", 1, 6)
WHERE EXISTS (
  SELECT 1 FROM "workspaces" o
  WHERE o."slug" = w."slug" AND o."id" <> w."id"
);--> statement-breakpoint
ALTER TABLE "workspaces" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_slug_unique" UNIQUE("slug");
