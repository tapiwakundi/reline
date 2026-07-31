"use client";

import { useQuery } from "@tanstack/react-query";
import type { BoardCompletedWindow } from "@/lib/board-display";
import { fetchJson } from "@/lib/fetch-json";
import { queryKeys } from "@/lib/query-keys";
import type {
  CycleListItem,
  InboxItem,
  IssueDetailData,
  IssueListItem,
  WorkspaceSettings,
} from "@/lib/types";

export function useBoardIssues(
  opts: { completed: BoardCompletedWindow; showBacklog: boolean },
  initialData?: IssueListItem[]
) {
  const params = new URLSearchParams({
    completed: opts.completed,
    showBacklog: opts.showBacklog ? "1" : "0",
  });
  return useQuery({
    queryKey: queryKeys.issues.board(opts),
    queryFn: async () => {
      const data = await fetchJson<{ issues: IssueListItem[] }>(
        `/api/issues?${params}`
      );
      return data.issues;
    },
    initialData,
  });
}

export function useIssuesList(initialData?: IssueListItem[]) {
  return useQuery({
    queryKey: queryKeys.issues.list(),
    queryFn: async () => {
      const data = await fetchJson<{ issues: IssueListItem[] }>("/api/issues");
      return data.issues;
    },
    initialData,
  });
}

export function useIssueDetail(key: string, initialData?: IssueDetailData) {
  return useQuery({
    queryKey: queryKeys.issues.detail(key),
    queryFn: () =>
      fetchJson<IssueDetailData>(`/api/issues/${encodeURIComponent(key)}`),
    initialData,
  });
}

export function useCycles(initialData?: CycleListItem[]) {
  return useQuery({
    queryKey: queryKeys.cycles.list(),
    queryFn: async () => {
      const data = await fetchJson<{ cycles: CycleListItem[] }>("/api/cycles");
      return data.cycles;
    },
    initialData,
  });
}

export function useInbox(initialData?: InboxItem[]) {
  return useQuery({
    queryKey: queryKeys.inbox.list(),
    queryFn: async () => {
      const data = await fetchJson<{ notifications: InboxItem[] }>("/api/inbox");
      return data.notifications;
    },
    initialData,
  });
}

export function useUnreadCount(initialData?: number) {
  return useQuery({
    queryKey: queryKeys.inbox.unread(),
    queryFn: async () => {
      const data = await fetchJson<{ count: number }>(
        "/api/notifications/count"
      );
      return data.count;
    },
    initialData,
    refetchInterval: 20_000,
  });
}

export function useWorkspaceSettings(initialData?: WorkspaceSettings) {
  return useQuery({
    queryKey: queryKeys.workspace.settings(),
    queryFn: () => fetchJson<WorkspaceSettings>("/api/workspace"),
    initialData,
  });
}
