"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  comments,
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

function revalidateIssueViews() {
  revalidatePath("/board");
  revalidatePath("/issues");
  revalidatePath("/my-issues");
  revalidatePath("/inbox");
  revalidatePath("/cycles");
}

async function ownedIssue(issueId: string, workspaceId: string) {
  const issue = await db.query.issues.findFirst({
    where: and(eq(issues.id, issueId), eq(issues.workspaceId, workspaceId)),
  });
  if (!issue) throw new Error("Issue not found");
  return issue;
}

export async function createIssue(input: {
  title: string;
  description?: string;
  statusId?: string;
  priority?: number;
  assigneeId?: string | null;
  cycleId?: string | null;
  labelIds?: string[];
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

  const [issue] = await db
    .insert(issues)
    .values({
      workspaceId: workspace.id,
      number: ws.counter,
      title,
      description: input.description?.trim() ?? "",
      priority: input.priority ?? 0,
      statusId,
      assigneeId: input.assigneeId ?? null,
      cycleId: input.cycleId ?? null,
      creatorId: user.id,
      boardOrder: Date.now(),
    })
    .returning();

  if (input.labelIds?.length) {
    await db
      .insert(issueLabels)
      .values(input.labelIds.map((labelId) => ({ issueId: issue.id, labelId })));
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

  revalidateIssueViews();
  return { id: issue.id, identifier: `${workspace.prefix}-${issue.number}` };
}

export async function updateIssue(
  issueId: string,
  patch: {
    title?: string;
    description?: string;
    statusId?: string;
    priority?: number;
    assigneeId?: string | null;
    cycleId?: string | null;
    estimate?: number | null;
    labelIds?: string[];
  }
) {
  const { workspace, user } = await requireWorkspace();
  const before = await ownedIssue(issueId, workspace.id);

  const { labelIds, ...fields } = patch;

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
  if (patch.statusId && patch.statusId !== before.statusId) {
    const [from, to] = await Promise.all([
      db.query.statuses.findFirst({ where: eq(statuses.id, before.statusId) }),
      db.query.statuses.findFirst({ where: eq(statuses.id, patch.statusId) }),
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

  revalidateIssueViews();
  revalidatePath(`/issue/${workspace.prefix}-${before.number}`);
}

export async function moveIssueOnBoard(
  issueId: string,
  statusId: string,
  boardOrder: number
) {
  const t0 = Date.now();
  // #region agent log
  fetch('http://127.0.0.1:7359/ingest/c6e924e4-96dd-46bf-962f-91fc58f5ca8b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f545ab'},body:JSON.stringify({sessionId:'f545ab',runId:'pre-fix',hypothesisId:'A',location:'issues.ts:moveIssueOnBoard:enter',message:'server move enter',data:{issueId,statusId,boardOrder},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
  const { workspace, user } = await requireWorkspace();
  const tAuth = Date.now();
  const before = await ownedIssue(issueId, workspace.id);
  const tOwned = Date.now();

  // Fast path: persist the move first so the client isn't waiting on side effects
  await db
    .update(issues)
    .set({ statusId, boardOrder, updatedAt: new Date() })
    .where(eq(issues.id, issueId));
  const tUpdate = Date.now();

  // Skip revalidating /board — the board already updated optimistically.
  // Revalidating it was causing a multi-second snap/lag after drop.
  if (statusId !== before.statusId) {
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
    revalidatePath("/inbox");
    revalidatePath("/issues");
    revalidatePath("/my-issues");
  }
  // #region agent log
  fetch('http://127.0.0.1:7359/ingest/c6e924e4-96dd-46bf-962f-91fc58f5ca8b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'f545ab'},body:JSON.stringify({sessionId:'f545ab',runId:'pre-fix',hypothesisId:'A',location:'issues.ts:moveIssueOnBoard:exit',message:'server move exit',data:{issueId,statusChanged:statusId!==before.statusId,authMs:tAuth-t0,ownedMs:tOwned-tAuth,updateMs:tUpdate-tOwned,sideEffectMs:Date.now()-tUpdate,totalMs:Date.now()-t0},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
}

export async function deleteIssue(issueId: string) {
  const { workspace } = await requireWorkspace();
  await ownedIssue(issueId, workspace.id);
  await db.delete(issues).where(eq(issues.id, issueId));
  revalidateIssueViews();
}

export async function addComment(issueId: string, body: string) {
  const { workspace, user } = await requireWorkspace();
  const issue = await ownedIssue(issueId, workspace.id);
  const trimmed = body.trim();
  if (!trimmed) return;

  await db.insert(comments).values({ issueId, authorId: user.id, body: trimmed });

  const data = await getWorkspaceData(
    { id: workspace.id, name: workspace.name, prefix: workspace.prefix },
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
    payload: { preview: trimmed.slice(0, 80) },
    extraRecipients: otherCommenters.map((c) => c.authorId),
    excludeRecipients: mentionedIds,
  });

  revalidatePath(`/issue/${workspace.prefix}-${issue.number}`);
  revalidatePath("/inbox");
}
