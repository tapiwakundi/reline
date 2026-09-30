import { Hono } from "hono";
import { COMPLETED_OPTIONS, type BoardCompletedWindow } from "@reline/shared";
import { getIssueDetail, getIssues } from "@/lib/queries";
import { requireWorkspace, type WorkspaceEnv } from "@/middleware/auth";
import {
  addComment,
  attachToIssue,
  bulkUpdateIssues,
  createIssue,
  deleteAttachment,
  deleteIssue,
  moveIssueOnBoard,
  moveIssueOnBoardGrouped,
  setBoardOrders,
  updateIssue,
} from "@/services/issues";
import type { AttachmentInput, BoardMoveTarget, IssueUpdatePatch } from "@reline/shared";
import { HttpError } from "@/lib/context";

const COMPLETED_VALUES = new Set(
  COMPLETED_OPTIONS.map((o) => o.value as string)
);

export const issuesRoutes = new Hono<WorkspaceEnv>();

issuesRoutes.get("/issues", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  const completedRaw = c.req.query("completed");
  const completed =
    completedRaw && COMPLETED_VALUES.has(completedRaw)
      ? (completedRaw as BoardCompletedWindow)
      : undefined;
  const showBacklogParam = c.req.query("showBacklog");
  const showBacklog =
    showBacklogParam === null || showBacklogParam === undefined
      ? undefined
      : showBacklogParam !== "0";

  const issues = await getIssues(ctx.workspace.id, ctx.workspace.prefix, {
    completed,
    showBacklog,
  });
  return c.json({ issues });
});

issuesRoutes.get("/issues/:key", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  const key = decodeURIComponent(c.req.param("key"));
  const data = await getIssueDetail(
    ctx.workspace.id,
    ctx.workspace.prefix,
    key
  );
  if (!data) throw new HttpError(404, "Not found");
  return c.json(data);
});

issuesRoutes.post("/issues", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  const input = await c.req.json<{
    title: string;
    description?: string;
    statusId?: string;
    priority?: number;
    type?: "story" | "task" | "bug";
    assigneeId?: string | null;
    cycleId?: string | null;
    labelIds?: string[];
    attachments?: AttachmentInput[];
  }>();
  const result = await createIssue(ctx, input);
  return c.json(result);
});

issuesRoutes.post("/issues/bulk", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  const body = await c.req.json<{
    issueIds: string[];
    patch: IssueUpdatePatch;
  }>();
  await bulkUpdateIssues(ctx, body.issueIds, body.patch);
  return c.json({ ok: true });
});

issuesRoutes.post("/issues/board-orders", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  const body = await c.req.json<{
    entries: { issueId: string; boardOrder: number }[];
  }>();
  await setBoardOrders(ctx, body.entries ?? []);
  return c.json({ ok: true });
});

issuesRoutes.patch("/issues/:id", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  const patch = await c.req.json<IssueUpdatePatch>();
  await updateIssue(ctx, c.req.param("id"), patch);
  return c.json({ ok: true });
});

issuesRoutes.delete("/issues/:id", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  await deleteIssue(ctx, c.req.param("id"));
  return c.json({ ok: true });
});

issuesRoutes.post("/issues/:id/move", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  const body = await c.req.json<{
    statusId: string;
    boardOrder: number;
    siblingOrders?: { issueId: string; boardOrder: number }[];
  }>();
  await moveIssueOnBoard(
    ctx,
    c.req.param("id"),
    body.statusId,
    body.boardOrder,
    body.siblingOrders ?? []
  );
  return c.json({ ok: true });
});

issuesRoutes.post("/issues/:id/move-grouped", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  const body = await c.req.json<{
    target: BoardMoveTarget;
    boardOrder: number;
    siblingOrders?: { issueId: string; boardOrder: number }[];
  }>();
  await moveIssueOnBoardGrouped(
    ctx,
    c.req.param("id"),
    body.target,
    body.boardOrder,
    body.siblingOrders ?? []
  );
  return c.json({ ok: true });
});

issuesRoutes.post("/issues/:id/attachments", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  const body = await c.req.json<{ attachments: AttachmentInput[] }>();
  await attachToIssue(ctx, c.req.param("id"), body.attachments ?? []);
  return c.json({ ok: true });
});

issuesRoutes.post("/issues/:id/comments", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  const body = await c.req.json<{
    body: string;
    attachments?: AttachmentInput[];
    parentId?: string | null;
  }>();
  await addComment(
    ctx,
    c.req.param("id"),
    body.body ?? "",
    body.attachments,
    body.parentId
  );
  return c.json({ ok: true });
});

issuesRoutes.delete("/attachments/:id", requireWorkspace, async (c) => {
  const ctx = c.get("ctx");
  await deleteAttachment(ctx, c.req.param("id"));
  return c.json({ ok: true });
});
