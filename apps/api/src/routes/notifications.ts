import { Hono } from "hono";
import { getInbox, getUnreadCount } from "@/lib/queries";
import { requireWorkspace, type WorkspaceEnv } from "@/middleware/auth";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/services/notifications";

export const notificationsRoutes = new Hono<WorkspaceEnv>();

notificationsRoutes.get("/inbox", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  const notifications = await getInbox(
    ctx.user.id,
    ctx.workspace.id,
    ctx.workspace.prefix
  );
  return c.json({ notifications });
});

notificationsRoutes.get("/notifications/count", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  const count = await getUnreadCount(ctx.user.id, ctx.workspace.id);
  return c.json({ count });
});

notificationsRoutes.post("/notifications/read-all", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  await markAllNotificationsRead(ctx.user, ctx);
  return c.json({ ok: true });
});

notificationsRoutes.post(
  "/notifications/:id/read",
  requireWorkspace,
  async (c) => {
    const ctx = c.get("ctx");
    await markNotificationRead(ctx.user, c.req.param("id"));
    return c.json({ ok: true });
  }
);
