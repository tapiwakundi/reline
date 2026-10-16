CREATE UNIQUE INDEX "statuses_ws_name_idx" ON "statuses" ("workspace_id", lower("name"));
