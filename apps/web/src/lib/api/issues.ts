import { fetchJson, jsonBody } from "@/lib/fetch-json";
import { workspaceSlugFromPath } from "@/lib/workspace-slug";
import type {
  AttachmentInput,
  BoardMoveTarget,
  IssueUpdatePatch,
} from "@/lib/types";

function ws() {
  return { workspaceSlug: workspaceSlugFromPath() };
}

export type { AttachmentInput, IssueUpdatePatch, BoardMoveTarget };

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
  return fetchJson<{ id: string; identifier: string }>(
    "/api/issues",
    { ...jsonBody(input), ...ws() }
  );
}

export async function updateIssue(
  issueId: string,
  patch: IssueUpdatePatch
): Promise<void> {
  await fetchJson<{ ok: true }>(`/api/issues/${issueId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
    ...ws(),
  });
}

export async function bulkUpdateIssues(
  issueIds: string[],
  patch: IssueUpdatePatch
): Promise<void> {
  await fetchJson<{ ok: true }>("/api/issues/bulk", {
    ...jsonBody({ issueIds, patch }),
    ...ws(),
  });
}

export async function moveIssueOnBoard(
  issueId: string,
  statusId: string,
  boardOrder: number,
  siblingOrders: { issueId: string; boardOrder: number }[] = []
): Promise<void> {
  await fetchJson<{ ok: true }>(`/api/issues/${issueId}/move`, {
    ...jsonBody({ statusId, boardOrder, siblingOrders }),
    ...ws(),
  });
}

export async function setBoardOrders(
  entries: { issueId: string; boardOrder: number }[]
): Promise<void> {
  await fetchJson<{ ok: true }>("/api/issues/board-orders", {
    ...jsonBody({ entries }),
    ...ws(),
  });
}

export async function moveIssueOnBoardGrouped(
  issueId: string,
  target: BoardMoveTarget,
  boardOrder: number,
  siblingOrders: { issueId: string; boardOrder: number }[] = []
): Promise<void> {
  await fetchJson<{ ok: true }>(`/api/issues/${issueId}/move-grouped`, {
    ...jsonBody({ target, boardOrder, siblingOrders }),
    ...ws(),
  });
}

export async function deleteIssue(issueId: string): Promise<void> {
  await fetchJson<{ ok: true }>(`/api/issues/${issueId}`, {
    method: "DELETE",
    ...ws(),
  });
}

export async function attachToIssue(
  issueId: string,
  attachments: AttachmentInput[]
): Promise<void> {
  await fetchJson<{ ok: true }>(`/api/issues/${issueId}/attachments`, {
    ...jsonBody({ attachments }),
    ...ws(),
  });
}

export async function deleteAttachment(attachmentId: string): Promise<void> {
  await fetchJson<{ ok: true }>(`/api/attachments/${attachmentId}`, {
    method: "DELETE",
    ...ws(),
  });
}

export async function addComment(
  issueId: string,
  body: string,
  attachments?: AttachmentInput[],
  parentId?: string | null
): Promise<void> {
  await fetchJson<{ ok: true }>(`/api/issues/${issueId}/comments`, {
    ...jsonBody({ body, attachments, parentId }),
    ...ws(),
  });
}

export async function deleteComment(
  issueId: string,
  commentId: string
): Promise<void> {
  await fetchJson<{ ok: true }>(
    `/api/issues/${issueId}/comments/${commentId}`,
    { method: "DELETE", ...ws() }
  );
}
