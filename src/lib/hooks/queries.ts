"use client";

import { useQuery } from "@tanstack/react-query";
import type { BoardCompletedWindow } from "@/lib/board-display";
import { fetchJson } from "@/lib/fetch-json";
import { queryKeys } from "@/lib/query-keys";
import { useWorkspace } from "@/lib/workspace-context";
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
  const { workspace } = useWorkspace();
  const params = new URLSearchParams({
    completed: opts.completed,
    showBacklog: opts.showBacklog ? "1" : "0",
  });
  return useQuery({
    queryKey: queryKeys.issues.board(workspace.id, opts),
    queryFn: async () => {
      const data = await fetchJson<{ issues: IssueListItem[] }>(
        `/api/issues?${params}`,
        { workspaceSlug: workspace.slug }
      );
      return data.issues;
    },
    initialData,
  });
}

export function useIssuesList(initialData?: IssueListItem[]) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: queryKeys.issues.list(workspace.id),
    queryFn: async () => {
      const data = await fetchJson<{ issues: IssueListItem[] }>("/api/issues", {
        workspaceSlug: workspace.slug,
      });
      return data.issues;
    },
    initialData,
  });
}

export function useIssueDetail(key: string, initialData?: IssueDetailData) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: queryKeys.issues.detail(workspace.id, key),
    queryFn: () =>
      fetchJson<IssueDetailData>(
        `/api/issues/${encodeURIComponent(key)}`,
        { workspaceSlug: workspace.slug }
      ),
    initialData,
  });
}

export function useCycles(initialData?: CycleListItem[]) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: queryKeys.cycles.list(workspace.id),
    queryFn: async () => {
      const data = await fetchJson<{ cycles: CycleListItem[] }>("/api/cycles", {
        workspaceSlug: workspace.slug,
      });
      return data.cycles;
    },
    initialData,
  });
}

export function useInbox(initialData?: InboxItem[]) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: queryKeys.inbox.list(workspace.id),
    queryFn: async () => {
      const data = await fetchJson<{ notifications: InboxItem[] }>(
        "/api/inbox",
        { workspaceSlug: workspace.slug }
      );
      return data.notifications;
    },
    initialData,
  });
}

export function useUnreadCount(initialData?: number) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: queryKeys.inbox.unread(workspace.id),
    queryFn: async () => {
      const data = await fetchJson<{ count: number }>(
        "/api/notifications/count",
        { workspaceSlug: workspace.slug }
      );
      return data.count;
    },
    initialData,
    refetchInterval: 20_000,
  });
}

export function useWorkspaceSettings(initialData?: WorkspaceSettings) {
  const { workspace } = useWorkspace();
  return useQuery({
    queryKey: queryKeys.workspace.settings(workspace.id),
    queryFn: () =>
      fetchJson<WorkspaceSettings>("/api/workspace", {
        workspaceSlug: workspace.slug,
      }),
    initialData,
  });
}
