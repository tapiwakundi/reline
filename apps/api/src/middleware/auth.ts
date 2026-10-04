import { createMiddleware } from "hono/factory";
import { WORKSPACE_SLUG_COOKIE } from "@reline/shared";
import { HttpError, type AuthUser, type WorkspaceContext } from "@/lib/context";
import {
  cookieValue,
  getSessionFromHeaders,
  resolveMembership,
} from "@/lib/session";

type AuthEnv = { Variables: { user: AuthUser } };
type WorkspaceEnv = { Variables: { user: AuthUser; ctx: WorkspaceContext } };

export type { AuthEnv, WorkspaceEnv };

export const requireUser = createMiddleware<AuthEnv>(async (c, next) => {
  const session = await getSessionFromHeaders(c.req.raw.headers);
  if (!session) {
    throw new HttpError(401, "Unauthorized");
  }
  c.set("user", {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image ?? null,
  });
  await next();
});

export const requireWorkspace = createMiddleware<WorkspaceEnv>(async (c, next) => {
  const session = await getSessionFromHeaders(c.req.raw.headers);
  if (!session) {
    throw new HttpError(401, "Unauthorized");
  }

  const slug =
    c.req.header("x-workspace-slug")?.trim() ||
    c.req.query("workspace")?.trim() ||
    cookieValue(c.req.header("cookie"), WORKSPACE_SLUG_COOKIE);
  if (!slug) {
    throw new HttpError(400, "Workspace required");
  }

  const resolved = await resolveMembership(session.user.id, slug);
  if (!resolved) {
    throw new HttpError(404, "No workspace");
  }

  const user: AuthUser = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image ?? null,
  };
  c.set("user", user);
  c.set("ctx", {
    user,
    membership: resolved.membership,
    workspace: resolved.workspace,
  });
  await next();
});
