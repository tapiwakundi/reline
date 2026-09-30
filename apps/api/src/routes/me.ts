import { Hono } from "hono";
import {
  WORKSPACE_SLUG_COOKIE,
  normalizeBoardDisplayPrefs,
} from "@reline/shared";
import { getUnreadCount, getWorkspaceData } from "@/lib/queries";
import {
  cookieValue,
  getSessionFromHeaders,
  getUserWorkspaces,
  homeBoardPath,
  resolveMembership,
} from "@/lib/session";
import { HttpError } from "@/lib/context";
import { requireUser, type AuthEnv } from "@/middleware/auth";

export const meRoutes = new Hono<AuthEnv>();

meRoutes.get("/me", requireUser, async (c) => {
  const user = c.get("user");
  const workspaces = await getUserWorkspaces(user.id);
  const cookieSlug = cookieValue(c.req.header("cookie"), WORKSPACE_SLUG_COOKIE);
  return c.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image ?? null,
    },
    workspaces,
    homePath: homeBoardPath(workspaces, cookieSlug),
  });
});

meRoutes.get("/workspaces/:slug/bootstrap", requireUser, async (c) => {
  const user = c.get("user");
  const slug = c.req.param("slug");
  const resolved = await resolveMembership(user.id, slug);
  if (!resolved) throw new HttpError(404, "No workspace");

  const { workspace, membership } = resolved;
  const [data, unread, workspaces] = await Promise.all([
    getWorkspaceData(
      {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        prefix: workspace.prefix,
        logo: workspace.logo ?? null,
      },
      user.id
    ),
    getUnreadCount(user.id, workspace.id),
    getUserWorkspaces(user.id),
  ]);

  return c.json({
    ...data,
    workspaces,
    unread,
    membership: {
      id: membership.id,
      role: membership.role,
      boardDisplay: membership.boardDisplay
        ? normalizeBoardDisplayPrefs(membership.boardDisplay)
        : null,
    },
  });
});

/** Optional session lookup used by public pages that branch on auth. */
meRoutes.get("/session", async (c) => {
  const session = await getSessionFromHeaders(c.req.raw.headers);
  if (!session) return c.json({ user: null }, 200);
  return c.json({
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image ?? null,
    },
  });
});
