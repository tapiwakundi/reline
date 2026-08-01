import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { memberships, workspaces } from "@/db/schema";
import { getSession } from "@/lib/session";
import { WORKSPACE_SLUG_COOKIE } from "@/lib/workspace-slug";

async function slugFromRequest(req?: Request): Promise<string | undefined> {
  const header = req?.headers.get("x-workspace-slug")?.trim();
  if (header) return header;
  const cookieStore = await cookies();
  return cookieStore.get(WORKSPACE_SLUG_COOKIE)?.value;
}

export async function requireApiWorkspace(req?: Request) {
  const session = await getSession();
  if (!session) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const slug = await slugFromRequest(req);
  if (!slug) {
    return {
      error: Response.json({ error: "Workspace required" }, { status: 400 }),
    };
  }

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.slug, slug),
  });
  if (!workspace) {
    return { error: Response.json({ error: "No workspace" }, { status: 404 }) };
  }

  const membership = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.userId, session.user.id),
      eq(memberships.workspaceId, workspace.id)
    ),
  });
  if (!membership) {
    return { error: Response.json({ error: "No workspace" }, { status: 404 }) };
  }

  return {
    session,
    user: session.user,
    membership,
    workspace,
  };
}
