"use client";

import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";

export function invalidateIssues(qc: QueryClient) {
  return qc.invalidateQueries({ queryKey: queryKeys.issues.all });
}

export function invalidateCycles(qc: QueryClient) {
  return qc.invalidateQueries({ queryKey: queryKeys.cycles.all });
}

export function invalidateInbox(qc: QueryClient) {
  return qc.invalidateQueries({ queryKey: queryKeys.inbox.all });
}

export function invalidateWorkspace(qc: QueryClient) {
  return qc.invalidateQueries({ queryKey: queryKeys.workspace.all });
}

/** After issue create / update / move / delete. */
export function invalidateAfterIssueChange(qc: QueryClient) {
  return Promise.all([
    invalidateIssues(qc),
    invalidateCycles(qc),
    invalidateInbox(qc),
  ]);
}

/** After cycle create / start / complete / delete. */
export function invalidateAfterCycleChange(qc: QueryClient) {
  return Promise.all([invalidateCycles(qc), invalidateIssues(qc)]);
}

/** After label CRUD. */
export function invalidateAfterLabelChange(qc: QueryClient) {
  return Promise.all([invalidateWorkspace(qc), invalidateIssues(qc)]);
}

/** After notification read. */
export function invalidateAfterNotificationChange(qc: QueryClient) {
  return invalidateInbox(qc);
}

/** After Jira import. */
export function invalidateAfterImport(qc: QueryClient) {
  return Promise.all([
    invalidateIssues(qc),
    invalidateCycles(qc),
    invalidateWorkspace(qc),
  ]);
}
