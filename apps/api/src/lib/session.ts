import { WORKSPACE_SLUG_COOKIE, wsPath, type WorkspaceListItem } from "@reline/shared";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, workspaces } from "@/db/schema";
import { auth, type Session } from "@/lib/auth";

export async function getSessionFromHeaders(
  headers: Headers
): Promise<Session | null> {
  return auth.api.getSession({ headers });
}

export async function getUserWorkspaces(
  userId: string
): Promise<WorkspaceListItem[]> {
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
      logo: m.workspace.logo ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function resolveMembership(userId: string, slug: string) {
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

export function cookieValue(
  cookieHeader: string | undefined,
  name: string
): string | undefined {
  if (!cookieHeader) return undefined;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export function homeBoardPath(
  list: WorkspaceListItem[],
  cookieSlug?: string
): string {
  if (!list.length) return "/onboarding";
  const preferred =
    (cookieSlug && list.find((w) => w.slug === cookieSlug)) || list[0];
  return wsPath(preferred.slug, "/board");
}

export function workspaceSlugCookie(slug: string, maxAgeSeconds = 60 * 60 * 24 * 365) {
  return `${WORKSPACE_SLUG_COOKIE}=${encodeURIComponent(slug)}; Path=/; SameSite=Lax; HttpOnly; Max-Age=${maxAgeSeconds}`;
}

export function clearWorkspaceSlugCookie() {
  return `${WORKSPACE_SLUG_COOKIE}=; Path=/; SameSite=Lax; HttpOnly; Max-Age=0`;
}
