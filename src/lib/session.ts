import { cache } from "react";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { memberships, workspaces } from "@/db/schema";
import { WORKSPACE_SLUG_COOKIE, wsPath } from "@/lib/workspace-paths";

export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export const requireSession = cache(async () => {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
});

export type WorkspaceListItem = {
  id: string;
  name: string;
  slug: string;
  prefix: string;
};

/** All workspaces the signed-in user belongs to, ordered by name. */
export const getUserWorkspaces = cache(
  async (userId: string): Promise<WorkspaceListItem[]> => {
    const rows = await db.query.memberships.findMany({
      where: eq(memberships.userId, userId),
      with: { workspace: true },
    });
    return rows
      .map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        slug: m.workspace.slug,
        prefix: m.workspace.prefix,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
);

async function resolveMembership(userId: string, slug: string) {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.slug, slug),
  });
  if (!workspace) return null;
  const membership = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.userId, userId),
      eq(memberships.workspaceId, workspace.id)
    ),
  });
  if (!membership) return null;
  return { workspace, membership };
}

/**
 * Resolve workspace from a URL slug and verify membership.
 * Middleware syncs the last-used cookie from the same slug.
 */
export const requireWorkspaceBySlug = cache(async (slug: string) => {
  const session = await requireSession();
  const resolved = await resolveMembership(session.user.id, slug);
  if (!resolved) notFound();

  return {
    session,
    user: session.user,
    membership: resolved.membership,
    workspace: resolved.workspace,
  };
});

/**
 * Workspace context for server actions: uses the last-used slug cookie
 * (set by middleware from the URL). Falls back to the user's first membership.
 */
export const requireWorkspace = cache(async () => {
  const session = await requireSession();
  const list = await getUserWorkspaces(session.user.id);
  if (!list.length) redirect("/onboarding");

  const cookieStore = await cookies();
  const cookieSlug = cookieStore.get(WORKSPACE_SLUG_COOKIE)?.value;
  const preferred =
    (cookieSlug && list.find((w) => w.slug === cookieSlug)) || list[0];

  const resolved = await resolveMembership(session.user.id, preferred.slug);
  if (!resolved) redirect("/onboarding");

  return {
    session,
    user: session.user,
    membership: resolved.membership,
    workspace: resolved.workspace,
  };
});

/** Redirect target after login / home: last-used workspace board, or first membership. */
export async function homeBoardPath(userId: string): Promise<string> {
  const list = await getUserWorkspaces(userId);
  if (!list.length) return "/onboarding";

  const cookieStore = await cookies();
  const cookieSlug = cookieStore.get(WORKSPACE_SLUG_COOKIE)?.value;
  const preferred =
    (cookieSlug && list.find((w) => w.slug === cookieSlug)) || list[0];
  return wsPath(preferred.slug, "/board");
}
