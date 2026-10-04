import "@/lib/env";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { auth } from "@/lib/auth";
import { HttpError } from "@/lib/context";
import { attachmentsRoutes } from "@/routes/attachments";
import { cyclesRoutes } from "@/routes/cycles";
import { importRoutes } from "@/routes/import";
import { invitesRoutes } from "@/routes/invites";
import { issuesRoutes } from "@/routes/issues";
import { labelsRoutes } from "@/routes/labels";
import { mcpRoutes } from "@/routes/mcp";
import { mcpTokenRoutes } from "@/routes/mcp-tokens";
import { meRoutes } from "@/routes/me";
import { notificationsRoutes } from "@/routes/notifications";
import { posthogProxyRoutes } from "@/routes/posthog-proxy";
import { profileRoutes } from "@/routes/profile";
import { slackRoutes } from "@/routes/slack";
import { workspaceRoutes } from "@/routes/workspace";

const app = new Hono();

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json({ error: err.message }, err.status as ContentfulStatusCode);
  }
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error(err);
  const message = err instanceof Error ? err.message : "Internal error";
  return c.json({ error: message }, 500);
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.get("/api/health", (c) => c.json({ ok: true }));

app.route("/api", posthogProxyRoutes);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.use(
  "/api/attachments/*",
  bodyLimit({ maxSize: 110 * 1024 * 1024 })
);
app.use("/api/profile/avatar", bodyLimit({ maxSize: 6 * 1024 * 1024 }));
app.use("/api/workspace/logo", bodyLimit({ maxSize: 6 * 1024 * 1024 }));
app.use("/api/import/*", bodyLimit({ maxSize: 50 * 1024 * 1024 }));

app.route("/api", meRoutes);
app.route("/api", mcpTokenRoutes);
app.route("/api", mcpRoutes);
app.route("/api", invitesRoutes);
app.route("/api", workspaceRoutes);
app.route("/api", slackRoutes);
app.route("/api", issuesRoutes);
app.route("/api", cyclesRoutes);
app.route("/api", labelsRoutes);
app.route("/api", notificationsRoutes);
app.route("/api", profileRoutes);
app.route("/api", attachmentsRoutes);
app.route("/api", importRoutes);

const port = Number(process.env.PORT ?? 4001);
const hostname = process.env.HOST ?? "0.0.0.0";

serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`API listening on http://${info.address}:${info.port}`);
});
