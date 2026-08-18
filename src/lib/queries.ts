import { and, asc, count, desc, eq, gte, isNull, notInArray, or } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  attachments,
  comments,
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
import { resolveCycleStatuses } from "@/lib/cycle-status";
import { publicUrl } from "@/lib/r2";
import type {
  CycleListItem,
  CycleRow,
  InboxItem,
  IssueDetailData,
  IssueListItem,
  LabelRow,
  Member,
  StatusRow,
  WorkspaceData,
  WorkspaceSettings,
} from "@/lib/types";

export async function getWorkspaceData(
  workspace: { id: string; name: string; slug: string; prefix: string },
  meId: string
): Promise<Omit<WorkspaceData, "workspaces">> {
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
    type: i.type,
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

export async function getUnreadCount(
  userId: string,
  workspaceId: string
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.workspaceId, workspaceId),
        isNull(notifications.readAt)
      )
    );
  return row?.value ?? 0;
}

export async function getCyclesList(
  workspaceId: string
): Promise<CycleListItem[]> {
  const [cycleRows, issueRows, statusRows] = await Promise.all([
    db.query.cycles.findMany({
      where: eq(cycles.workspaceId, workspaceId),
      orderBy: asc(cycles.startDate),
    }),
    db.query.issues.findMany({
      where: eq(issues.workspaceId, workspaceId),
      columns: { id: true, cycleId: true, statusId: true, estimate: true },
    }),
    db.query.statuses.findMany({
      where: eq(statuses.workspaceId, workspaceId),
    }),
  ]);

  const statusType = new Map(statusRows.map((s) => [s.id, s.type]));
  const statusOf = resolveCycleStatuses(cycleRows);

  return cycleRows.map((c) => {
    const inCycle = issueRows.filter((i) => i.cycleId === c.id);
    let done = 0;
    let started = 0;
    let pending = 0;
    let estimateTotal = 0;
    let estimateDone = 0;
    for (const i of inCycle) {
      const type = statusType.get(i.statusId);
      const est = i.estimate ?? 0;
      estimateTotal += est;
      if (type === "done" || type === "canceled") {
        done++;
        estimateDone += est;
      } else if (type === "started") {
        started++;
      } else {
        pending++;
      }
    }
    return {
      id: c.id,
      number: c.number,
      name: c.name,
      startDate: c.startDate.toISOString(),
      endDate: c.endDate.toISOString(),
      status: statusOf(c),
      total: inCycle.length,
      done,
      started,
      pending,
      estimateTotal,
      estimateDone,
    };
  });
}

export async function getIssueDetail(
  workspaceId: string,
  prefix: string,
  key: string
): Promise<IssueDetailData | null> {
  const match = key.match(/^(.+)-(\d+)$/);
  if (!match || match[1] !== prefix) return null;
  const number = Number(match[2]);
  if (!Number.isFinite(number)) return null;

  const issue = await db.query.issues.findFirst({
    where: and(eq(issues.workspaceId, workspaceId), eq(issues.number, number)),
    with: { labels: true, creator: true },
  });
  if (!issue) return null;

  const [commentRows, activityRows, attachmentRows] = await Promise.all([
    db.query.comments.findMany({
      where: eq(comments.issueId, issue.id),
      with: { author: true },
      orderBy: asc(comments.createdAt),
    }),
    db.query.activities.findMany({
      where: eq(activities.issueId, issue.id),
      with: { actor: true },
      orderBy: asc(activities.createdAt),
    }),
    db.query.attachments.findMany({
      where: eq(attachments.issueId, issue.id),
      orderBy: asc(attachments.createdAt),
    }),
  ]);

  const toSaved = (a: (typeof attachmentRows)[number]) => ({
    id: a.id,
    url: publicUrl(a.key),
    filename: a.filename,
    kind: a.kind,
  });
  const issueAttachments = attachmentRows
    .filter((a) => a.commentId === null)
    .map(toSaved);
  const commentAttachments = new Map<string, ReturnType<typeof toSaved>[]>();
  for (const a of attachmentRows) {
    if (!a.commentId) continue;
    const list = commentAttachments.get(a.commentId) ?? [];
    list.push(toSaved(a));
    commentAttachments.set(a.commentId, list);
  }

  return {
    issue: {
      id: issue.id,
      identifier: `${prefix}-${issue.number}`,
      title: issue.title,
      description: issue.description,
      type: issue.type,
      priority: issue.priority,
      statusId: issue.statusId,
      assigneeId: issue.assigneeId,
      creator: issue.creator
        ? {
            id: issue.creator.id,
            name: issue.creator.name,
            email: issue.creator.email,
            image: issue.creator.image ?? null,
          }
        : null,
      cycleId: issue.cycleId,
      labelIds: issue.labels.map((l) => l.labelId),
      createdAt: issue.createdAt.toISOString(),
      attachments: issueAttachments,
    },
    comments: commentRows.map((c) => ({
      id: c.id,
      parentId: c.parentId,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      author: c.author
        ? {
            id: c.author.id,
            name: c.author.name,
            email: c.author.email,
            image: c.author.image ?? null,
          }
        : null,
      attachments: commentAttachments.get(c.id) ?? [],
    })),
    activities: activityRows.map((a) => ({
      id: a.id,
      type: a.type,
      data: a.data ?? {},
      createdAt: a.createdAt.toISOString(),
      actor: a.actor
        ? {
            id: a.actor.id,
            name: a.actor.name,
            email: a.actor.email,
            image: a.actor.image ?? null,
          }
        : null,
    })),
  };
}

export async function getInbox(
  userId: string,
  workspaceId: string,
  prefix: string
): Promise<InboxItem[]> {
  const rows = await db.query.notifications.findMany({
    where: and(
      eq(notifications.userId, userId),
      eq(notifications.workspaceId, workspaceId)
    ),
    with: { issue: true, actor: true },
    orderBy: desc(notifications.createdAt),
    limit: 100,
  });

  return rows.map((n) => ({
      id: n.id,
      type: n.type,
      payload: (n.payload ?? {}) as Record<string, string>,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
      issue: {
        identifier: `${prefix}-${n.issue.number}`,
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
  }));
}

export async function getWorkspaceSettings(
  workspace: {
    id: string;
    name: string;
    slug: string;
    prefix: string;
    createdAt: Date;
  },
  membershipRole: string,
  meId: string
): Promise<WorkspaceSettings> {
  const data = await getWorkspaceData(
    {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      prefix: workspace.prefix,
    },
    meId
  );
  return {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      prefix: workspace.prefix,
      createdAt: workspace.createdAt.toISOString(),
    },
    role: membershipRole,
    members: data.members,
    labels: data.labels,
  };
}
