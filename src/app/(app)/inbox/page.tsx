import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requireWorkspace } from "@/lib/session";
import { InboxList } from "@/components/inbox/inbox-list";

export default async function InboxPage() {
  const { user, workspace } = await requireWorkspace();

  const rows = await db.query.notifications.findMany({
    where: eq(notifications.userId, user.id),
    with: { issue: true, actor: true },
    orderBy: desc(notifications.createdAt),
    limit: 100,
  });

  return (
    <InboxList
      notifications={rows.map((n) => ({
        id: n.id,
        type: n.type,
        payload: n.payload ?? {},
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
        issue: {
          identifier: `${workspace.prefix}-${n.issue.number}`,
          title: n.issue.title,
        },
        actor: n.actor
          ? {
              id: n.actor.id,
              name: n.actor.name,
              email: n.actor.email,
              image: n.actor.image ?? null,
            }
          : null,
      }))}
    />
  );
}
