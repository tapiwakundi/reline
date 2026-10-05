import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  attachments,
  comments,
  cycles,
  issueLabels,
  issues,
  memberships,
  notifications,
  statuses,
  workspaces,
} from "@/db/schema";
import {
  MAX_ATTACHMENTS,
  activeCycleIdFromRows,
  classifyContentType,
  cycleIdForBacklogEntry,
  cycleIdForTodoEntry,
  mentionsAdded,
  todoStatusIdForCycleEntry,
  type AttachmentInput,
  type BoardMoveTarget,
  type IssueUpdatePatch,
  type Member,
} from "@reline/shared";
import { notifyIssueEvent, recordActivity } from "@/lib/notify";
import { deleteObjects } from "@/lib/r2";
import { HttpError, type WorkspaceContext } from "@/lib/context";
import {
  setIssueSlackChannelArchived,
  syncSlackAfterWrite,
} from "@/services/slack";

async function runSlack(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (error) {
    console.error("[slack]", error);
  }
}

async function syncSlackArchiveForStatus(
  workspaceId: string,
  issueId: string,
  statusId: string
) {
  const status = await db.query.statuses.findFirst({
    where: eq(statuses.id, statusId),
    columns: { type: true },
  });
  if (!status) return;
  await setIssueSlackChannelArchived({
    workspaceId,
    issueId,
    archived: status.type === "done" || status.type === "canceled",
  });
}

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

async function ownedIssue(issueId: string, workspaceId: string) {
  const issue = await db.query.issues.findFirst({
    where: and(eq(issues.id, issueId), eq(issues.workspaceId, workspaceId)),
  });
  if (!issue) throw new HttpError(404, "Issue not found");
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

/** Notify people newly @mentioned in an issue description or comment. */
async function notifyNewMentions(opts: {
  workspaceId: string;
  issueId: string;
  actorId: string;
  before: string;
  after: string;
}): Promise<Set<string>> {
  const after = opts.after.trim();
  if (!after.includes("@")) return new Set();

  const memberRows = await db.query.memberships.findMany({
    where: eq(memberships.workspaceId, opts.workspaceId),
    with: { user: true },
  });
  const members: Member[] = memberRows.map((row) => ({
    id: row.user.id,
    name: row.user.name,
    email: row.user.email,
    image: row.user.image ?? null,
  }));
  const mentioned = mentionsAdded(opts.before, after, members).filter(
    (member) => member.id !== opts.actorId
  );
  if (mentioned.length === 0) return new Set();

  await db.insert(notifications).values(
    mentioned.map((member) => ({
      userId: member.id,
      workspaceId: opts.workspaceId,
      issueId: opts.issueId,
      actorId: opts.actorId,
      type: "mentioned" as const,
      payload: { preview: after.slice(0, 80) },
    }))
  );
  return new Set(mentioned.map((member) => member.id));
}

export async function createIssue(ctx: WorkspaceContext, input: {
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
  const { workspace, user } = ctx;
  const title = input.title.trim();
  if (!title) throw new HttpError(400, "Title is required");

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

  await notifyNewMentions({
    workspaceId: workspace.id,
    issueId: issue.id,
    actorId: user.id,
    before: "",
    after: issue.description,
  });
  await runSlack(() =>
    syncSlackAfterWrite({
      workspaceId: workspace.id,
      issueId: issue.id,
      actorId: user.id,
      text: issue.description,
      mentionBefore: "",
      kind: "description",
    })
  );

  if (issue.assigneeId && issue.assigneeId !== user.id) {
    await notifyIssueEvent({
      issueId: issue.id,
      workspaceId: workspace.id,
      actorId: user.id,
      type: "assigned",
    });
  }

  return { id: issue.id, identifier: `${workspace.prefix}-${issue.number}` };
}

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
    await runSlack(() =>
      syncSlackArchiveForStatus(workspace.id, issueId, nextStatusId)
    );
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

  if (
    fields.description !== undefined &&
    fields.description !== before.description
  ) {
    const description = fields.description;
    await notifyNewMentions({
      workspaceId: workspace.id,
      issueId,
      actorId: user.id,
      before: before.description,
      after: description,
    });
    await runSlack(() =>
      syncSlackAfterWrite({
        workspaceId: workspace.id,
        issueId,
        actorId: user.id,
        text: description,
        mentionBefore: before.description,
        kind: "description",
      })
    );
  }
}

export async function updateIssue(ctx: WorkspaceContext, issueId: string, patch: IssueUpdatePatch) {
  const { workspace, user } = ctx;
  const before = await ownedIssue(issueId, workspace.id);
  await applyIssueUpdate(workspace, user, before, patch);
}

export async function bulkUpdateIssues(
  ctx: WorkspaceContext,
  issueIds: string[],
  patch: IssueUpdatePatch
) {
  const uniqueIds = [...new Set(issueIds)];
  if (uniqueIds.length === 0) return;

  const { workspace, user } = ctx;
  const rows = await db.query.issues.findMany({
    where: and(
      eq(issues.workspaceId, workspace.id),
      inArray(issues.id, uniqueIds)
    ),
  });
  if (rows.length !== uniqueIds.length) {
    throw new HttpError(404, "Issue not found");
  }

  for (const before of rows) {
    await applyIssueUpdate(workspace, user, before, patch);
  }

}

export async function moveIssueOnBoard(
  ctx: WorkspaceContext,
  issueId: string,
  statusId: string,
  boardOrder: number,
  siblingOrders: { issueId: string; boardOrder: number }[] = []
) {
  const { workspace, user } = ctx;
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
    await setBoardOrders(ctx, siblingOrders);
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
    await runSlack(() =>
      syncSlackArchiveForStatus(workspace.id, issueId, statusId)
    );
  }
}

/** Persist explicit board ranks without touching updatedAt. */
export async function setBoardOrders(
  ctx: WorkspaceContext,
  entries: { issueId: string; boardOrder: number }[]
) {
  if (entries.length === 0) return;
  const workspace = ctx.workspace;

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

export async function moveIssueOnBoardGrouped(
  ctx: WorkspaceContext,
  issueId: string,
  target: BoardMoveTarget,
  boardOrder: number,
  siblingOrders: { issueId: string; boardOrder: number }[] = []
) {
  if (target.kind === "status") {
    return moveIssueOnBoard(ctx, issueId, target.statusId, boardOrder, siblingOrders);
  }

  const { workspace, user } = ctx;
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
    await setBoardOrders(ctx, siblingOrders);
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
  }

  if (fields.statusId && fields.statusId !== before.statusId) {
    const nextStatusId = fields.statusId;
    const to = await db.query.statuses.findFirst({
      where: eq(statuses.id, nextStatusId),
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
    await runSlack(() =>
      syncSlackArchiveForStatus(workspace.id, issueId, nextStatusId)
    );
  }
}

export async function deleteIssue(ctx: WorkspaceContext, issueId: string) {
  const { workspace } = ctx;
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

}

export async function attachToIssue(
  ctx: WorkspaceContext,
  issueId: string,
  input: AttachmentInput[]
) {
  const { workspace, user } = ctx;
  const issue = await ownedIssue(issueId, workspace.id);
  if (!input.length) return;

  await insertAttachments(input, {
    workspaceId: workspace.id,
    issueId,
    uploaderId: user.id,
  });

}

export async function deleteComment(ctx: WorkspaceContext, commentId: string) {
  const { workspace, user } = ctx;

  const comment = await db.query.comments.findFirst({
    where: eq(comments.id, commentId),
  });
  if (!comment) throw new HttpError(404, "Comment not found");

  await ownedIssue(comment.issueId, workspace.id);
  if (comment.authorId !== user.id) {
    throw new HttpError(403, "You can only delete your own comments");
  }

  const thread = await db.query.comments.findMany({
    where: or(eq(comments.id, commentId), eq(comments.parentId, commentId)),
    columns: { id: true },
  });
  const ids = thread.map((row) => row.id);
  const files = ids.length
    ? await db.query.attachments.findMany({
        where: inArray(attachments.commentId, ids),
        columns: { key: true },
      })
    : [];

  // Replies and their attachment rows cascade from this delete.
  await db.delete(comments).where(eq(comments.id, commentId));

  if (files.length) {
    await deleteObjects(files.map((file) => file.key));
  }
}

export async function deleteAttachment(ctx: WorkspaceContext, attachmentId: string) {
  const { workspace } = ctx;

  const attachment = await db.query.attachments.findFirst({
    where: and(
      eq(attachments.id, attachmentId),
      eq(attachments.workspaceId, workspace.id)
    ),
  });
  if (!attachment) throw new HttpError(404, "Attachment not found");

  const issue = await ownedIssue(attachment.issueId, workspace.id);

  await db.delete(attachments).where(eq(attachments.id, attachmentId));
  await deleteObjects([attachment.key]);

}

export async function addComment(
  ctx: WorkspaceContext,
  issueId: string,
  body: string,
  attachmentInput?: AttachmentInput[],
  parentId?: string | null,
  slack?: {
    source?: "app" | "slack";
    slackChannelId?: string;
    slackTs?: string;
  }
) {
  const { workspace, user } = ctx;
  await ownedIssue(issueId, workspace.id);
  const trimmed = body.trim();
  if (!trimmed && !attachmentInput?.length) return;

  const source = slack?.source ?? "app";

  // Replies attach to the thread's root comment (threads are one level deep).
  // Slack replies stay a flat ticket transcript.
  let resolvedParentId: string | null = null;
  if (parentId && source !== "slack") {
    const parent = await db.query.comments.findFirst({
      where: and(eq(comments.id, parentId), eq(comments.issueId, issueId)),
    });
    if (!parent) throw new HttpError(404, "Comment to reply to was not found");
    resolvedParentId = parent.parentId ?? parent.id;
  }

  const inserted = await db
    .insert(comments)
    .values({
      issueId,
      authorId: user.id,
      body: trimmed,
      parentId: resolvedParentId,
      source,
      slackChannelId: slack?.slackChannelId ?? null,
      slackTs: slack?.slackTs ?? null,
    })
    .onConflictDoNothing()
    .returning();
  const comment = inserted[0];
  if (!comment) return;

  if (attachmentInput?.length) {
    await insertAttachments(attachmentInput, {
      workspaceId: workspace.id,
      issueId,
      commentId: comment.id,
      uploaderId: user.id,
    });
  }

  // Mentions get a dedicated notification (takes priority over "commented")
  const mentionedIds = await notifyNewMentions({
    workspaceId: workspace.id,
    issueId,
    actorId: user.id,
    before: "",
    after: trimmed,
  });

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

  if (source !== "slack") {
    await runSlack(() =>
      syncSlackAfterWrite({
        workspaceId: workspace.id,
        issueId,
        actorId: user.id,
        text: trimmed,
        mentionBefore: "",
        kind: "comment",
        commentId: comment.id,
        source,
      })
    );
  }
}
