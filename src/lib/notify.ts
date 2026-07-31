import { db } from "@/db";
import {
  activities,
  issues,
  notifications,
  type NotificationType,
} from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Fan out a notification about an issue to the people who care about it
 * (assignee + creator), excluding the actor themself.
 */
export async function notifyIssueEvent(opts: {
  issueId: string;
  workspaceId: string;
  actorId: string;
  type: NotificationType;
  payload?: Record<string, string>;
  extraRecipients?: (string | null | undefined)[];
  /** Skip these user IDs (e.g. already received a more specific "mentioned" notif). */
  excludeRecipients?: Iterable<string>;
}) {
  const issue = await db.query.issues.findFirst({
    where: eq(issues.id, opts.issueId),
    columns: { assigneeId: true, creatorId: true },
  });
  if (!issue) return;

  const excluded = new Set(opts.excludeRecipients ?? []);
  const recipients = new Set(
    [issue.assigneeId, issue.creatorId, ...(opts.extraRecipients ?? [])].filter(
      (id): id is string =>
        !!id && id !== opts.actorId && !excluded.has(id)
    )
  );
  if (recipients.size === 0) return;

  await db.insert(notifications).values(
    [...recipients].map((userId) => ({
      userId,
      workspaceId: opts.workspaceId,
      issueId: opts.issueId,
      actorId: opts.actorId,
      type: opts.type,
      payload: opts.payload,
    }))
  );
}

export async function recordActivity(opts: {
  issueId: string;
  actorId: string;
  type: string;
  data?: Record<string, string | null>;
}) {
  await db.insert(activities).values({
    issueId: opts.issueId,
    actorId: opts.actorId,
    type: opts.type,
    data: opts.data,
  });
}
