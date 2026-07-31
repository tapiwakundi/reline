import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { issues, memberships, workspaces } from "@/db/schema";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ issues: [] }, { status: 401 });

  const membership = await db.query.memberships.findFirst({
    where: eq(memberships.userId, session.user.id),
  });
  if (!membership) return Response.json({ issues: [] });

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, membership.workspaceId),
  });

  const rows = await db.query.issues.findMany({
    where: eq(issues.workspaceId, membership.workspaceId),
    orderBy: desc(issues.updatedAt),
    limit: 200,
    columns: { id: true, number: true, title: true },
  });

  return Response.json({
    issues: rows.map((i) => ({
      id: i.id,
      identifier: `${workspace?.prefix}-${i.number}`,
      title: i.title,
    })),
  });
}
