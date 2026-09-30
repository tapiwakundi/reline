import { Hono } from "hono";
import { requireWorkspace, type WorkspaceEnv } from "@/middleware/auth";
import { createLabel, deleteLabel, updateLabel } from "@/services/labels";

export const labelsRoutes = new Hono<WorkspaceEnv>();

labelsRoutes.post("/labels", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  const body = await c.req.json<{ name: string; color: string }>();
  const label = await createLabel(ctx, body.name, body.color);
  return c.json({ label });
});

labelsRoutes.patch("/labels/:id", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  const body = await c.req.json<{ name: string; color: string }>();
  await updateLabel(ctx, c.req.param("id"), body.name, body.color);
  return c.json({ ok: true });
});

labelsRoutes.delete("/labels/:id", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  await deleteLabel(ctx, c.req.param("id"));
  return c.json({ ok: true });
});
