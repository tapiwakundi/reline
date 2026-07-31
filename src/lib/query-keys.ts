import type { BoardCompletedWindow } from "@/lib/board-display";

export const queryKeys = {
  issues: {
    all: ["issues"] as const,
    list: () => ["issues", "list"] as const,
    board: (opts: {
      completed: BoardCompletedWindow;
      showBacklog: boolean;
    }) => ["issues", "board", opts.completed, opts.showBacklog] as const,
    detail: (key: string) => ["issues", "detail", key] as const,
  },
  cycles: {
    all: ["cycles"] as const,
    list: () => ["cycles", "list"] as const,
  },
  inbox: {
    all: ["inbox"] as const,
    list: () => ["inbox", "list"] as const,
    unread: () => ["inbox", "unread"] as const,
  },
  workspace: {
    all: ["workspace"] as const,
    settings: () => ["workspace", "settings"] as const,
  },
};
