import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, workspaces } from "@/db/schema";
import { getSession } from "@/lib/session";

export async function requireApiWorkspace() {
  const session = await getSession();
  if (!session) {
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const membership = await db.query.memberships.findFirst({
    where: eq(memberships.userId, session.user.id),
  });
  if (!membership) {
    return { error: Response.json({ error: "No workspace" }, { status: 404 }) };
  }

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, membership.workspaceId),
  });
  if (!workspace) {
    return { error: Response.json({ error: "No workspace" }, { status: 404 }) };
  }

  return {
    session,
    user: session.user,
    membership,
    workspace,
  };
}
