"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  attachments,
  comments,
  cycles,
  issueLabels,
  issues,
  notifications,
  statuses,
  workspaces,
} from "@/db/schema";
import { requireWorkspace } from "@/lib/session";
import { getWorkspaceData } from "@/lib/queries";
import { resolveMentions } from "@/lib/mentions";
import { notifyIssueEvent, recordActivity } from "@/lib/notify";
import {
  activeCycleIdFromRows,
  cycleIdForBacklogEntry,
  cycleIdForTodoEntry,
  todoStatusIdForCycleEntry,
} from "@/lib/issue-cycle";
import { classifyContentType, deleteObjects, MAX_ATTACHMENTS } from "@/lib/r2";
import { revalidateWorkspaceLists } from "@/lib/revalidate";
import { wsPath } from "@/lib/workspace-paths";

export type AttachmentInput = {
  key: string;
  filename: string;
  contentType: string;
  size: number;
};

async function insertAttachments(
  input: AttachmentInput[],
  ctx: {
    workspaceId: string;
    issueId: string;
    commentId?: string;
    uploaderId: string;
  }
) {
  const rows = input.slice(0, MAX_ATTACHMENTS).flatMap((a) => {
    const media = classifyContentType(a.contentType);
    if (!media) return [];
    return [
      {
        workspaceId: ctx.workspaceId,
        issueId: ctx.issueId,
        commentId: ctx.commentId ?? null,
        uploaderId: ctx.uploaderId,
        key: a.key,
        filename: a.filename,
        contentType: a.contentType,
        size: a.size,
        kind: media.kind,
      },
    ];
  });
  if (rows.length) await db.insert(attachments).values(rows);
}

function revalidateIssueViews(slug: string) {
  revalidateWorkspaceLists(slug);
}

async function ownedIssue(issueId: string, workspaceId: string) {
  const issue = await db.query.issues.findFirst({
    where: and(eq(issues.id, issueId), eq(issues.workspaceId, workspaceId)),
  });
  if (!issue) throw new Error("Issue not found");
  return issue;
}

/** Promote Backlog → Todo when assigning a cycle. */
async function statusIdWhenEnteringCycle(
  workspaceId: string,
  currentStatusId: string,
  cycleId: string | null | undefined
): Promise<string | undefined> {
  if (!cycleId) return undefined;
  const workspaceStatuses = await db.query.statuses.findMany({
    where: eq(statuses.workspaceId, workspaceId),
    columns: { id: true, type: true },
  });
  return todoStatusIdForCycleEntry(
    workspaceStatuses,
    currentStatusId,
    cycleId
  );
}

/** Assign current cycle when moving Backlog → Todo. */
async function cycleIdWhenLeavingBacklogToTodo(
  workspaceId: string,
  currentStatusId: string,
  nextStatusId: string,
  existingCycleId: string | null
): Promise<string | undefined> {
  if (existingCycleId) return undefined;
  const [workspaceStatuses, cycleRows] = await Promise.all([
    db.query.statuses.findMany({
      where: eq(statuses.workspaceId, workspaceId),
      columns: { id: true, type: true },
    }),
    db.query.cycles.findMany({
      where: eq(cycles.workspaceId, workspaceId),
      columns: { id: true, status: true, startDate: true, endDate: true },
    }),
  ]);
  return cycleIdForTodoEntry(
    workspaceStatuses,
    currentStatusId,
    nextStatusId,
    existingCycleId,
    activeCycleIdFromRows(cycleRows)
  );
}

/** Clear cycle when moving into Backlog. */
async function cycleIdWhenEnteringBacklog(
  workspaceId: string,
  nextStatusId: string,
  existingCycleId: string | null
): Promise<null | undefined> {
  if (existingCycleId == null) return undefined;
  const workspaceStatuses = await db.query.statuses.findMany({
    where: eq(statuses.workspaceId, workspaceId),
    columns: { id: true, type: true },
  });
  return cycleIdForBacklogEntry(
    workspaceStatuses,
    nextStatusId,
    existingCycleId
  );
}

export async function createIssue(input: {
  title: string;
  description?: string;
  statusId?: string;
  priority?: number;
  type?: "story" | "task" | "bug";
  assigneeId?: string | null;
  cycleId?: string | null;
  labelIds?: string[];
  attachments?: AttachmentInput[];
}) {
  const { workspace, user } = await requireWorkspace();
  const title = input.title.trim();
  if (!title) throw new Error("Title is required");

  const [ws] = await db
    .update(workspaces)
    .set({ issueCounter: sql`${workspaces.issueCounter} + 1` })
    .where(eq(workspaces.id, workspace.id))
    .returning({ counter: workspaces.issueCounter });

  let statusId = input.statusId;
  if (!statusId) {
    const backlog = await db.query.statuses.findFirst({
      where: and(
        eq(statuses.workspaceId, workspace.id),
        eq(statuses.type, "backlog")
      ),
    });
    statusId = backlog!.id;
  }

  const cycleId = input.cycleId ?? null;
  const promoted = await statusIdWhenEnteringCycle(
    workspace.id,
    statusId,
    cycleId
  );
  if (promoted) statusId = promoted;

  const [issue] = await db
    .insert(issues)
    .values({
      workspaceId: workspace.id,
      number: ws.counter,
      title,
      description: input.description?.trim() ?? "",
      priority: input.priority ?? 0,
      type: input.type ?? "story",
      statusId,
      assigneeId: input.assigneeId ?? null,
      cycleId,
      creatorId: user.id,
      boardOrder: Date.now(),
    })
    .returning();

  if (input.labelIds?.length) {
    await db
      .insert(issueLabels)
      .values(input.labelIds.map((labelId) => ({ issueId: issue.id, labelId })));
  }

  if (input.attachments?.length) {
    await insertAttachments(input.attachments, {
      workspaceId: workspace.id,
      issueId: issue.id,
      uploaderId: user.id,
    });
  }

  await recordActivity({
    issueId: issue.id,
    actorId: user.id,
    type: "created",
  });

  if (issue.assigneeId && issue.assigneeId !== user.id) {
    await notifyIssueEvent({
      issueId: issue.id,
      workspaceId: workspace.id,
      actorId: user.id,
      type: "assigned",
    });
  }

  revalidateIssueViews(workspace.slug);
  return { id: issue.id, identifier: `${workspace.prefix}-${issue.number}` };
}

export type IssueUpdatePatch = {
  title?: string;
  description?: string;
  statusId?: string;
  priority?: number;
  type?: "story" | "task" | "bug";
  assigneeId?: string | null;
  cycleId?: string | null;
  estimate?: number | null;
  labelIds?: string[];
};

async function applyIssueUpdate(
  workspace: { id: string; slug: string; prefix: string },
  user: { id: string },
  before: typeof issues.$inferSelect,
  patch: IssueUpdatePatch
) {
  const issueId = before.id;
  const { labelIds, ...fields } = patch;

  // Moving a backlog issue into a cycle promotes it to Todo, unless the
  // caller is already setting an explicit status.
  if (fields.cycleId && !fields.statusId) {
    const promoted = await statusIdWhenEnteringCycle(
      workspace.id,
      before.statusId,
      fields.cycleId
    );
    if (promoted) fields.statusId = promoted;
  }

  // Status transitions that imply a cycle change, unless the caller already
  // set an explicit cycle (including clearing it).
  if (fields.statusId && fields.cycleId === undefined) {
    const cleared = await cycleIdWhenEnteringBacklog(
      workspace.id,
      fields.statusId,
      before.cycleId
    );
    if (cleared === null) {
      fields.cycleId = null;
    } else {
      const assigned = await cycleIdWhenLeavingBacklogToTodo(
        workspace.id,
        before.statusId,
        fields.statusId,
        before.cycleId
      );
      if (assigned) fields.cycleId = assigned;
    }
  }

  if (Object.keys(fields).length > 0) {
    await db
      .update(issues)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(issues.id, issueId));
  }

  if (labelIds) {
    await db.delete(issueLabels).where(eq(issueLabels.issueId, issueId));
    if (labelIds.length) {
      await db
        .insert(issueLabels)
        .values(labelIds.map((labelId) => ({ issueId, labelId })));
    }
  }

  // Notifications + activity for meaningful transitions
  const nextStatusId = fields.statusId;
  if (nextStatusId && nextStatusId !== before.statusId) {
    const [from, to] = await Promise.all([
      db.query.statuses.findFirst({ where: eq(statuses.id, before.statusId) }),
      db.query.statuses.findFirst({ where: eq(statuses.id, nextStatusId) }),
    ]);
    await recordActivity({
      issueId,
      actorId: user.id,
      type: "status_changed",
      data: { from: from?.name ?? null, to: to?.name ?? null },
    });
    await notifyIssueEvent({
      issueId,
      workspaceId: workspace.id,
      actorId: user.id,
      type: "status_changed",
      payload: { to: to?.name ?? "" },
    });
  }

  if (
    patch.assigneeId !== undefined &&
    patch.assigneeId !== before.assigneeId &&
    patch.assigneeId
  ) {
    await recordActivity({
      issueId,
      actorId: user.id,
      type: "assigned",
      data: { assigneeId: patch.assigneeId },
    });
    await notifyIssueEvent({
      issueId,
      workspaceId: workspace.id,
      actorId: user.id,
      type: "assigned",
    });
  }
}

export async function updateIssue(issueId: string, patch: IssueUpdatePatch) {
  const { workspace, user } = await requireWorkspace();
  const before = await ownedIssue(issueId, workspace.id);
  await applyIssueUpdate(workspace, user, before, patch);
  revalidateIssueViews(workspace.slug);
  revalidatePath(
    wsPath(workspace.slug, `/issue/${workspace.prefix}-${before.number}`)
  );
}

export async function bulkUpdateIssues(
  issueIds: string[],
  patch: IssueUpdatePatch
) {
  const uniqueIds = [...new Set(issueIds)];
  if (uniqueIds.length === 0) return;

  const { workspace, user } = await requireWorkspace();
  const rows = await db.query.issues.findMany({
    where: and(
      eq(issues.workspaceId, workspace.id),
      inArray(issues.id, uniqueIds)
    ),
  });
  if (rows.length !== uniqueIds.length) {
    throw new Error("Issue not found");
  }

  for (const before of rows) {
    await applyIssueUpdate(workspace, user, before, patch);
  }

  revalidateIssueViews(workspace.slug);
}

export async function moveIssueOnBoard(
  issueId: string,
  statusId: string,
  boardOrder: number,
  /** Sibling ranks to rewrite when a fractional insert collides. */
  siblingOrders: { issueId: string; boardOrder: number }[] = []
) {
  const { workspace, user } = await requireWorkspace();
  const before = await ownedIssue(issueId, workspace.id);

  const fields: {
    statusId: string;
    boardOrder: number;
    cycleId?: string | null;
  } = {
    statusId,
    boardOrder,
  };
  const cleared = await cycleIdWhenEnteringBacklog(
    workspace.id,
    statusId,
    before.cycleId
  );
  if (cleared === null) {
    fields.cycleId = null;
  } else {
    const assigned = await cycleIdWhenLeavingBacklogToTodo(
      workspace.id,
      before.statusId,
      statusId,
      before.cycleId
    );
    if (assigned) fields.cycleId = assigned;
  }

  const statusChanged = statusId !== before.statusId;
  const cycleChanged =
    fields.cycleId !== undefined && fields.cycleId !== before.cycleId;
  // Pure reorders should not bump updatedAt — board order is independent of
  // "last updated" sorting.
  const patch =
    statusChanged || cycleChanged
      ? { ...fields, updatedAt: new Date() }
      : fields;

  await db.update(issues).set(patch).where(eq(issues.id, issueId));

  if (siblingOrders.length > 0) {
    await setBoardOrders(siblingOrders, workspace.id);
  }

  // Skip revalidating /board — the board already updated optimistically.
  if (statusChanged) {
    const to = await db.query.statuses.findFirst({
      where: eq(statuses.id, statusId),
    });
    await recordActivity({
      issueId,
      actorId: user.id,
      type: "status_changed",
      data: { to: to?.name ?? null },
    });
    await notifyIssueEvent({
      issueId,
      workspaceId: workspace.id,
      actorId: user.id,
      type: "status_changed",
      payload: { to: to?.name ?? "" },
    });
    revalidateWorkspaceLists(workspace.slug);
  }
}

/** Persist explicit board ranks without touching updatedAt. */
export async function setBoardOrders(
  entries: { issueId: string; boardOrder: number }[],
  workspaceId?: string
) {
  if (entries.length === 0) return;
  const workspace =
    workspaceId != null
      ? { id: workspaceId }
      : (await requireWorkspace()).workspace;

  await Promise.all(
    entries.map(async ({ issueId, boardOrder }) => {
      await ownedIssue(issueId, workspace.id);
      await db
        .update(issues)
        .set({ boardOrder })
        .where(and(eq(issues.id, issueId), eq(issues.workspaceId, workspace.id)));
    })
  );
}

export type BoardMoveTarget =
  | { kind: "status"; statusId: string }
  | { kind: "assignee"; assigneeId: string | null }
  | { kind: "priority"; priority: number }
  | { kind: "cycle"; cycleId: string | null };

/**
 * Board drop handler for non-status column groupings (assignee, priority,
 * cycle). Status-grouped boards keep using moveIssueOnBoard so status-change
 * notifications stay in one place.
 */
export async function moveIssueOnBoardGrouped(
  issueId: string,
  target: BoardMoveTarget,
  boardOrder: number,
  siblingOrders: { issueId: string; boardOrder: number }[] = []
) {
  if (target.kind === "status") {
    return moveIssueOnBoard(issueId, target.statusId, boardOrder, siblingOrders);
  }

  const { workspace, user } = await requireWorkspace();
  const before = await ownedIssue(issueId, workspace.id);

  const fields: Partial<{
    assigneeId: string | null;
    priority: number;
    cycleId: string | null;
    statusId: string;
  }> =
    target.kind === "assignee"
      ? { assigneeId: target.assigneeId }
      : target.kind === "priority"
        ? { priority: target.priority }
        : { cycleId: target.cycleId };

  if (target.kind === "cycle" && target.cycleId) {
    const promoted = await statusIdWhenEnteringCycle(
      workspace.id,
      before.statusId,
      target.cycleId
    );
    if (promoted) fields.statusId = promoted;
  }

  const groupChanged =
    (target.kind === "assignee" && target.assigneeId !== before.assigneeId) ||
    (target.kind === "priority" && target.priority !== before.priority) ||
    (target.kind === "cycle" && target.cycleId !== before.cycleId) ||
    (fields.statusId != null && fields.statusId !== before.statusId);

  const patch = groupChanged
    ? { ...fields, boardOrder, updatedAt: new Date() }
    : { ...fields, boardOrder };

  await db.update(issues).set(patch).where(eq(issues.id, issueId));

  if (siblingOrders.length > 0) {
    await setBoardOrders(siblingOrders, workspace.id);
  }

  // Skip revalidating /board — the board already updated optimistically.
  if (
    target.kind === "assignee" &&
    target.assigneeId &&
    target.assigneeId !== before.assigneeId
  ) {
    await recordActivity({
      issueId,
      actorId: user.id,
      type: "assigned",
      data: { assigneeId: target.assigneeId },
    });
    await notifyIssueEvent({
      issueId,
      workspaceId: workspace.id,
      actorId: user.id,
      type: "assigned",
    });
    revalidateWorkspaceLists(workspace.slug);
  }

  if (fields.statusId && fields.statusId !== before.statusId) {
    const to = await db.query.statuses.findFirst({
      where: eq(statuses.id, fields.statusId),
    });
    await recordActivity({
      issueId,
      actorId: user.id,
      type: "status_changed",
      data: { to: to?.name ?? null },
    });
    await notifyIssueEvent({
      issueId,
      workspaceId: workspace.id,
      actorId: user.id,
      type: "status_changed",
      payload: { to: to?.name ?? "" },
    });
    revalidateWorkspaceLists(workspace.slug);
  }
}

export async function deleteIssue(issueId: string) {
  const { workspace } = await requireWorkspace();
  await ownedIssue(issueId, workspace.id);

  const files = await db.query.attachments.findMany({
    where: eq(attachments.issueId, issueId),
    columns: { key: true },
  });

  await db.delete(issues).where(eq(issues.id, issueId));

  if (files.length) {
    // Best-effort cleanup; DB rows are already gone via cascade.
    await deleteObjects(files.map((f) => f.key));
  }

  revalidateIssueViews(workspace.slug);
}

export async function attachToIssue(
  issueId: string,
  input: AttachmentInput[]
) {
  const { workspace, user } = await requireWorkspace();
  const issue = await ownedIssue(issueId, workspace.id);
  if (!input.length) return;

  await insertAttachments(input, {
    workspaceId: workspace.id,
    issueId,
    uploaderId: user.id,
  });

  revalidatePath(wsPath(workspace.slug, `/issue/${workspace.prefix}-${issue.number}`));
}

export async function deleteAttachment(attachmentId: string) {
  const { workspace } = await requireWorkspace();

  const attachment = await db.query.attachments.findFirst({
    where: and(
      eq(attachments.id, attachmentId),
      eq(attachments.workspaceId, workspace.id)
    ),
  });
  if (!attachment) throw new Error("Attachment not found");

  const issue = await ownedIssue(attachment.issueId, workspace.id);

  await db.delete(attachments).where(eq(attachments.id, attachmentId));
  await deleteObjects([attachment.key]);

  revalidatePath(wsPath(workspace.slug, `/issue/${workspace.prefix}-${issue.number}`));
}

export async function addComment(
  issueId: string,
  body: string,
  attachmentInput?: AttachmentInput[],
  parentId?: string | null
) {
  const { workspace, user } = await requireWorkspace();
  const issue = await ownedIssue(issueId, workspace.id);
  const trimmed = body.trim();
  if (!trimmed && !attachmentInput?.length) return;

  // Replies attach to the thread's root comment (threads are one level deep).
  let resolvedParentId: string | null = null;
  if (parentId) {
    const parent = await db.query.comments.findFirst({
      where: and(eq(comments.id, parentId), eq(comments.issueId, issueId)),
    });
    if (!parent) throw new Error("Comment to reply to was not found");
    resolvedParentId = parent.parentId ?? parent.id;
  }

  const [comment] = await db
    .insert(comments)
    .values({ issueId, authorId: user.id, body: trimmed, parentId: resolvedParentId })
    .returning();

  if (attachmentInput?.length) {
    await insertAttachments(attachmentInput, {
      workspaceId: workspace.id,
      issueId,
      commentId: comment.id,
      uploaderId: user.id,
    });
  }

  const data = await getWorkspaceData(
    {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      prefix: workspace.prefix,
    },
    user.id
  );
  const mentioned = resolveMentions(trimmed, data.members).filter(
    (m) => m.id !== user.id
  );
  const mentionedIds = new Set(mentioned.map((m) => m.id));

  // Mentions get a dedicated notification (takes priority over "commented")
  if (mentioned.length > 0) {
    await db.insert(notifications).values(
      mentioned.map((m) => ({
        userId: m.id,
        workspaceId: workspace.id,
        issueId,
        actorId: user.id,
        type: "mentioned" as const,
        payload: { preview: trimmed.slice(0, 80) },
      }))
    );
  }

  const otherCommenters = await db
    .selectDistinct({ authorId: comments.authorId })
    .from(comments)
    .where(eq(comments.issueId, issueId));

  await notifyIssueEvent({
    issueId,
    workspaceId: workspace.id,
    actorId: user.id,
    type: "commented",
    payload: { preview: trimmed.slice(0, 80) || "Attached media" },
    extraRecipients: otherCommenters.map((c) => c.authorId),
    excludeRecipients: mentionedIds,
  });

  revalidatePath(wsPath(workspace.slug, `/issue/${workspace.prefix}-${issue.number}`));
  revalidatePath(wsPath(workspace.slug, "/inbox"));
}
