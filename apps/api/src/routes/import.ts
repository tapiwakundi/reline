import { Hono } from "hono";
import { HttpError } from "@/lib/context";
import { requireWorkspace, type WorkspaceEnv } from "@/middleware/auth";
import { importJiraApi, importJiraCsv } from "@/services/import";

export const importRoutes = new Hono<WorkspaceEnv>();

importRoutes.post("/import/jira-csv", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "No file uploaded");
  const report = await importJiraCsv(ctx, file);
  return c.json(report);
});

importRoutes.post("/import/jira-api", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  const input = await c.req.json<{
    siteUrl: string;
    email: string;
    apiToken: string;
    projectKey: string;
  }>();
  const report = await importJiraApi(ctx, input);
  return c.json(report);
});
