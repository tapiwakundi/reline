"use client";

import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  addComment,
  deleteAttachment,
  deleteIssue,
  updateIssue,
  type AttachmentInput,
} from "@/lib/actions/issues";
import { todoStatusIdForCycleEntry } from "@/lib/issue-cycle";
import { invalidateAfterIssueChange } from "@/lib/invalidate";
import { queryKeys } from "@/lib/query-keys";
import type {
  CommentItem,
  DetailIssue,
  IssueDetailData,
  IssueListItem,
  Member,
  StatusRow,
} from "@/lib/types";

export type IssuePatch = Parameters<typeof updateIssue>[1];

export function resolveIssuePatch(
  patch: IssuePatch,
  currentStatusId: string,
  statuses: StatusRow[]
): IssuePatch {
  if (patch.cycleId && !patch.statusId) {
    const statusId = todoStatusIdForCycleEntry(
      statuses,
      currentStatusId,
      patch.cycleId
    );
    if (statusId) return { ...patch, statusId };
  }
  return patch;
}

export function applyPatchToListItem(
  issue: IssueListItem,
  patch: IssuePatch
): IssueListItem {
  return {
    ...issue,
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
    ...(patch.statusId !== undefined ? { statusId: patch.statusId } : {}),
    ...(patch.assigneeId !== undefined ? { assigneeId: patch.assigneeId } : {}),
    ...(patch.cycleId !== undefined ? { cycleId: patch.cycleId } : {}),
    ...(patch.estimate !== undefined ? { estimate: patch.estimate } : {}),
    ...(patch.labelIds !== undefined ? { labelIds: patch.labelIds } : {}),
    updatedAt: new Date().toISOString(),
  };
}

function patchDetailIssue(issue: DetailIssue, patch: IssuePatch): DetailIssue {
  return {
    ...issue,
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.description !== undefined
      ? { description: patch.description }
      : {}),
    ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
    ...(patch.statusId !== undefined ? { statusId: patch.statusId } : {}),
    ...(patch.assigneeId !== undefined ? { assigneeId: patch.assigneeId } : {}),
    ...(patch.cycleId !== undefined ? { cycleId: patch.cycleId } : {}),
    ...(patch.labelIds !== undefined ? { labelIds: patch.labelIds } : {}),
  };
}

function isIssueListCache(
  data: unknown
): data is IssueListItem[] {
  return Array.isArray(data);
}

/** Snapshot every issues.* query so we can roll back on failure. */
function snapshotIssueQueries(qc: QueryClient, workspaceId: string) {
  return qc.getQueriesData({ queryKey: queryKeys.issues.all(workspaceId) });
}

function restoreIssueQueries(
  qc: QueryClient,
  snapshot: [QueryKey, unknown][]
) {
  for (const [key, data] of snapshot) {
    qc.setQueryData(key, data);
  }
}

export function applyIssuePatchToCaches(
  qc: QueryClient,
  workspaceId: string,
  issue: { id: string; identifier: string },
  patch: IssuePatch
) {
  qc.setQueriesData(
    { queryKey: queryKeys.issues.all(workspaceId) },
    (old: unknown) => {
      if (!isIssueListCache(old)) return old;
      return old.map((i) =>
        i.id === issue.id ? applyPatchToListItem(i, patch) : i
      );
    }
  );

  qc.setQueryData<IssueDetailData>(
    queryKeys.issues.detail(workspaceId, issue.identifier),
    (old) => {
      if (!old) return old;
      return { ...old, issue: patchDetailIssue(old.issue, patch) };
    }
  );
}

export function removeIssueFromCaches(
  qc: QueryClient,
  workspaceId: string,
  issue: { id: string; identifier: string }
) {
  qc.setQueriesData(
    { queryKey: queryKeys.issues.all(workspaceId) },
    (old: unknown) => {
      if (!isIssueListCache(old)) return old;
      return old.filter((i) => i.id !== issue.id);
    }
  );
  qc.removeQueries({
    queryKey: queryKeys.issues.detail(workspaceId, issue.identifier),
  });
}

export async function optimisticUpdateIssue(
  qc: QueryClient,
  workspaceId: string,
  issue: { id: string; identifier: string; statusId: string },
  patch: IssuePatch,
  statuses: StatusRow[]
) {
  const resolved = resolveIssuePatch(patch, issue.statusId, statuses);
  await qc.cancelQueries({ queryKey: queryKeys.issues.all(workspaceId) });
  const snapshot = snapshotIssueQueries(qc, workspaceId);
  applyIssuePatchToCaches(qc, workspaceId, issue, resolved);

  try {
    await updateIssue(issue.id, resolved);
  } catch (e) {
    restoreIssueQueries(qc, snapshot);
    toast.error(
      e instanceof Error ? e.message : "Couldn't update issue"
    );
    throw e;
  }

  void invalidateAfterIssueChange(qc, workspaceId);
}

export async function optimisticDeleteIssue(
  qc: QueryClient,
  workspaceId: string,
  issue: { id: string; identifier: string }
) {
  await qc.cancelQueries({ queryKey: queryKeys.issues.all(workspaceId) });
  const snapshot = snapshotIssueQueries(qc, workspaceId);
  removeIssueFromCaches(qc, workspaceId, issue);

  try {
    await deleteIssue(issue.id);
    toast.success(`${issue.identifier} deleted`);
  } catch (e) {
    restoreIssueQueries(qc, snapshot);
    toast.error(
      e instanceof Error ? e.message : "Couldn't delete issue"
    );
    throw e;
  }

  void invalidateAfterIssueChange(qc, workspaceId);
}

export async function optimisticAddComment(
  qc: QueryClient,
  workspaceId: string,
  issue: { id: string; identifier: string },
  body: string,
  author: Member,
  attachments: AttachmentInput[] = [],
  parentId?: string | null
) {
  // Attachments need server URLs — wait for the real response.
  if (attachments.length > 0) {
    await addComment(issue.id, body, attachments, parentId ?? null);
    await invalidateAfterIssueChange(qc, workspaceId);
    return;
  }

  const tempId = `temp-${Date.now()}`;
  const temp: CommentItem = {
    id: tempId,
    parentId: parentId ?? null,
    body,
    createdAt: new Date().toISOString(),
    author,
    attachments: [],
  };

  await qc.cancelQueries({
    queryKey: queryKeys.issues.detail(workspaceId, issue.identifier),
  });
  const previous = qc.getQueryData<IssueDetailData>(
    queryKeys.issues.detail(workspaceId, issue.identifier)
  );

  qc.setQueryData<IssueDetailData>(
    queryKeys.issues.detail(workspaceId, issue.identifier),
    (old) => {
      if (!old) return old;
      return { ...old, comments: [...old.comments, temp] };
    }
  );

  try {
    await addComment(issue.id, body, [], parentId ?? null);
  } catch (e) {
    qc.setQueryData(
      queryKeys.issues.detail(workspaceId, issue.identifier),
      previous
    );
    toast.error(
      e instanceof Error ? e.message : "Couldn't post comment"
    );
    throw e;
  }

  void invalidateAfterIssueChange(qc, workspaceId);
}

export async function optimisticDeleteAttachment(
  qc: QueryClient,
  workspaceId: string,
  issue: { identifier: string },
  attachmentId: string,
  deleteFn: (id: string) => Promise<void> = deleteAttachment
) {
  await qc.cancelQueries({
    queryKey: queryKeys.issues.detail(workspaceId, issue.identifier),
  });
  const previous = qc.getQueryData<IssueDetailData>(
    queryKeys.issues.detail(workspaceId, issue.identifier)
  );

  qc.setQueryData<IssueDetailData>(
    queryKeys.issues.detail(workspaceId, issue.identifier),
    (old) => {
      if (!old) return old;
      return {
        ...old,
        issue: {
          ...old.issue,
          attachments: old.issue.attachments.filter(
            (a) => a.id !== attachmentId
          ),
        },
        comments: old.comments.map((c) => ({
          ...c,
          attachments: c.attachments.filter((a) => a.id !== attachmentId),
        })),
      };
    }
  );

  try {
    await deleteFn(attachmentId);
  } catch (e) {
    qc.setQueryData(
      queryKeys.issues.detail(workspaceId, issue.identifier),
      previous
    );
    toast.error(
      e instanceof Error ? e.message : "Couldn't delete attachment"
    );
    throw e;
  }

  void invalidateAfterIssueChange(qc, workspaceId);
}
