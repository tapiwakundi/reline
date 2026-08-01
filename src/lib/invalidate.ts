"use client";

import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";

export function invalidateIssues(qc: QueryClient, workspaceId: string) {
  return qc.invalidateQueries({ queryKey: queryKeys.issues.all(workspaceId) });
}

export function invalidateCycles(qc: QueryClient, workspaceId: string) {
  return qc.invalidateQueries({ queryKey: queryKeys.cycles.all(workspaceId) });
}

export function invalidateInbox(qc: QueryClient, workspaceId: string) {
  return qc.invalidateQueries({ queryKey: queryKeys.inbox.all(workspaceId) });
}

export function invalidateWorkspace(qc: QueryClient, workspaceId: string) {
  return qc.invalidateQueries({
    queryKey: queryKeys.workspace.all(workspaceId),
  });
}

/** After issue create / update / move / delete. */
export function invalidateAfterIssueChange(
  qc: QueryClient,
  workspaceId: string
) {
  return Promise.all([
    invalidateIssues(qc, workspaceId),
    invalidateCycles(qc, workspaceId),
    invalidateInbox(qc, workspaceId),
  ]);
}

/** After cycle create / start / complete / delete. */
export function invalidateAfterCycleChange(
  qc: QueryClient,
  workspaceId: string
) {
  return Promise.all([
    invalidateCycles(qc, workspaceId),
    invalidateIssues(qc, workspaceId),
  ]);
}

/** After label CRUD. */
export function invalidateAfterLabelChange(
  qc: QueryClient,
  workspaceId: string
) {
  return Promise.all([
    invalidateWorkspace(qc, workspaceId),
    invalidateIssues(qc, workspaceId),
  ]);
}

/** After notification read. */
export function invalidateAfterNotificationChange(
  qc: QueryClient,
  workspaceId: string
) {
  return invalidateInbox(qc, workspaceId);
}

/** After Jira import. */
export function invalidateAfterImport(qc: QueryClient, workspaceId: string) {
  return Promise.all([
    invalidateIssues(qc, workspaceId),
    invalidateCycles(qc, workspaceId),
    invalidateWorkspace(qc, workspaceId),
  ]);
}
