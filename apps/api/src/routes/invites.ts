import { Hono } from "hono";
import { requireUser, type AuthEnv } from "@/middleware/auth";
import { workspaceSlugCookie } from "@/lib/session";
import { acceptInvite, getInvitePreview } from "@/services/workspace";

export const invitesRoutes = new Hono<AuthEnv>();

invitesRoutes.get("/invites/:token", async (c) => {
  const preview = await getInvitePreview(c.req.param("token"));
  return c.json(preview);
});

invitesRoutes.post("/invites/:token/accept", requireUser, async (c) => {
  const user = c.get("user");
  const { slug } = await acceptInvite(user, c.req.param("token"));
  c.header("Set-Cookie", workspaceSlugCookie(slug));
  return c.json({ slug });
});
