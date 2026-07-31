import { and, asc, count, eq, gte, isNull, notInArray, or } from "drizzle-orm";
import { db } from "@/db";
import {
  cycles,
  issues,
  labels,
  memberships,
  notifications,
  statuses,
} from "@/db/schema";
import {
  completedToDays,
  type BoardCompletedWindow,
} from "@/lib/board-display";
import type {
  CycleRow,
  IssueListItem,
  LabelRow,
  Member,
  StatusRow,
  WorkspaceData,
} from "@/lib/types";

export async function getWorkspaceData(
  workspace: { id: string; name: string; prefix: string },
  meId: string
): Promise<WorkspaceData> {
  const [memberRows, statusRows, labelRows, cycleRows] = await Promise.all([
    db.query.memberships.findMany({
      where: eq(memberships.workspaceId, workspace.id),
      with: { user: true },
    }),
    db.query.statuses.findMany({
      where: eq(statuses.workspaceId, workspace.id),
      orderBy: asc(statuses.position),
    }),
    db.query.labels.findMany({
      where: eq(labels.workspaceId, workspace.id),
      orderBy: asc(labels.name),
    }),
    db.query.cycles.findMany({
      where: eq(cycles.workspaceId, workspace.id),
      orderBy: asc(cycles.number),
    }),
  ]);

  const members: Member[] = memberRows.map((m) => ({
    id: m.user.id,
    name: m.user.name,
    email: m.user.email,
    image: m.user.image ?? null,
  }));

  return {
    workspace,
    me: members.find((m) => m.id === meId)!,
    members,
    statuses: statusRows as StatusRow[],
    labels: labelRows as LabelRow[],
    cycles: cycleRows.map(
      (c): CycleRow => ({
        id: c.id,
        number: c.number,
        name: c.name,
        startDate: c.startDate.toISOString(),
        endDate: c.endDate.toISOString(),
        status: c.status,
      })
    ),
  };
}

export async function getIssues(
  workspaceId: string,
  prefix: string,
  options?: { completed?: BoardCompletedWindow; showBacklog?: boolean }
): Promise<IssueListItem[]> {
  const days =
    options?.completed != null ? completedToDays(options.completed) : null;
  const hideBacklog = options?.showBacklog === false;

  const conditions = [eq(issues.workspaceId, workspaceId)];

  if (days !== null || hideBacklog) {
    const statusRows = await db.query.statuses.findMany({
      where: eq(statuses.workspaceId, workspaceId),
      columns: { id: true, type: true },
    });

    const completedIds = statusRows
      .filter((s) => s.type === "done" || s.type === "canceled")
      .map((s) => s.id);
    if (days !== null && completedIds.length > 0) {
      if (days === 0) {
        conditions.push(notInArray(issues.statusId, completedIds));
      } else {
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        conditions.push(
          or(
            notInArray(issues.statusId, completedIds),
            gte(issues.updatedAt, cutoff)
          )!
        );
      }
    }

    const backlogIds = statusRows
      .filter((s) => s.type === "backlog")
      .map((s) => s.id);
    if (hideBacklog && backlogIds.length > 0) {
      conditions.push(notInArray(issues.statusId, backlogIds));
    }
  }

  const rows = await db.query.issues.findMany({
    where: and(...conditions),
    with: { labels: true },
    orderBy: asc(issues.boardOrder),
  });

  return rows.map((i) => ({
    id: i.id,
    identifier: `${prefix}-${i.number}`,
    number: i.number,
    title: i.title,
    priority: i.priority,
    statusId: i.statusId,
    assigneeId: i.assigneeId,
    cycleId: i.cycleId,
    estimate: i.estimate,
    boardOrder: i.boardOrder,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
    labelIds: i.labels.map((l) => l.labelId),
  }));
}

export async function getUnreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.value ?? 0;
}
