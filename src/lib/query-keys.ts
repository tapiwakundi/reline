import type { BoardCompletedWindow } from "@/lib/board-display";

export const queryKeys = {
  issues: {
    all: (workspaceId: string) => ["issues", workspaceId] as const,
    list: (workspaceId: string) => ["issues", workspaceId, "list"] as const,
    board: (
      workspaceId: string,
      opts: {
        completed: BoardCompletedWindow;
        showBacklog: boolean;
      }
    ) =>
      [
        "issues",
        workspaceId,
        "board",
        opts.completed,
        opts.showBacklog,
      ] as const,
    detail: (workspaceId: string, key: string) =>
      ["issues", workspaceId, "detail", key] as const,
  },
  cycles: {
    all: (workspaceId: string) => ["cycles", workspaceId] as const,
    list: (workspaceId: string) => ["cycles", workspaceId, "list"] as const,
  },
  inbox: {
    all: (workspaceId: string) => ["inbox", workspaceId] as const,
    list: (workspaceId: string) => ["inbox", workspaceId, "list"] as const,
    unread: (workspaceId: string) =>
      ["inbox", workspaceId, "unread"] as const,
  },
  workspace: {
    all: (workspaceId: string) => ["workspace", workspaceId] as const,
    settings: (workspaceId: string) =>
      ["workspace", workspaceId, "settings"] as const,
  },
};
