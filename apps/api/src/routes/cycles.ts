import { Hono } from "hono";
import { getCyclesList } from "@/lib/queries";
import { requireWorkspace, type WorkspaceEnv } from "@/middleware/auth";
import {
  completeCycle,
  createCycle,
  deleteCycle,
  startCycle,
  updateCycle,
} from "@/services/cycles";
import type { CycleIssueDisposition } from "@reline/shared";

export const cyclesRoutes = new Hono<WorkspaceEnv>();

cyclesRoutes.get("/cycles", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  const cycles = await getCyclesList(ctx.workspace.id);
  return c.json({ cycles });
});

cyclesRoutes.post("/cycles", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  const input = await c.req.json<{
    name?: string;
    startDate: string;
    endDate: string;
  }>();
  await createCycle(ctx, input);
  return c.json({ ok: true });
});

cyclesRoutes.patch("/cycles/:id", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  const input = await c.req.json<{ name: string }>();
  await updateCycle(ctx, c.req.param("id"), input);
  return c.json({ ok: true });
});

cyclesRoutes.post("/cycles/:id/start", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  await startCycle(ctx, c.req.param("id"));
  return c.json({ ok: true });
});

cyclesRoutes.post("/cycles/:id/complete", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  const options = await c.req.json<{
    inProgress: CycleIssueDisposition;
    pending: CycleIssueDisposition;
    nextCycleId?: string | null;
  }>();
  await completeCycle(ctx, c.req.param("id"), options);
  return c.json({ ok: true });
});

cyclesRoutes.delete("/cycles/:id", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  await deleteCycle(ctx, c.req.param("id"));
  return c.json({ ok: true });
});
