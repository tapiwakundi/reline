import { requireApiWorkspace } from "@/lib/api-auth";
import { getIssues } from "@/lib/queries";
import {
  COMPLETED_OPTIONS,
  type BoardCompletedWindow,
} from "@/lib/board-display";

const COMPLETED_VALUES = new Set(
  COMPLETED_OPTIONS.map((o) => o.value as string)
);

export async function GET(request: Request) {
  const ctx = await requireApiWorkspace(request);
  if ("error" in ctx) return ctx.error;

  const url = new URL(request.url);
  const completedRaw = url.searchParams.get("completed");
  const completed =
    completedRaw && COMPLETED_VALUES.has(completedRaw)
      ? (completedRaw as BoardCompletedWindow)
      : undefined;
  const showBacklogParam = url.searchParams.get("showBacklog");
  const showBacklog =
    showBacklogParam === null ? undefined : showBacklogParam !== "0";

  const issues = await getIssues(ctx.workspace.id, ctx.workspace.prefix, {
    completed,
    showBacklog,
  });

  return Response.json({ issues });
}
