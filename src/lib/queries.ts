import { and, asc, count, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  cycles,
  issues,
  labels,
  memberships,
  notifications,
  statuses,
} from "@/db/schema";
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
  prefix: string
): Promise<IssueListItem[]> {
  const rows = await db.query.issues.findMany({
    where: eq(issues.workspaceId, workspaceId),
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
