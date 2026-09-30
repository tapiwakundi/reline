import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Board } from "@/components/board/board";
import { currentCycleId, normalizeBoardDisplayPrefs } from "@reline/shared";
import {
  CYCLE_FILTER_ALL,
  cycleFilterLabel,
  defaultCycleIdFromFilters,
  type CycleFilter,
} from "@/lib/filtering";
import { serverApi } from "@/lib/server-api";
import { wsPath } from "@/lib/workspace-paths";
import type { IssueListItem, WorkspaceBootstrap } from "@/lib/types";

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ cycle?: string | string[] }>;
}): Promise<Metadata> {
  const { workspaceSlug } = await params;
  const sp = await searchParams;
  const raw = Array.isArray(sp.cycle) ? sp.cycle[0] : sp.cycle;
  if (!raw || raw === CYCLE_FILTER_ALL) return { title: "Board" };

  const data = await serverApi<WorkspaceBootstrap>(
    `/api/workspaces/${encodeURIComponent(workspaceSlug)}/bootstrap`,
    { workspaceSlug }
  );
  const filter = raw as CycleFilter;
  const scopedId = defaultCycleIdFromFilters(
    {
      statusIds: [],
      types: [],
      priorities: [],
      assigneeIds: [],
      labelIds: [],
      cycleIds: [filter],
    },
    data.cycles
  );
  if (typeof scopedId === "string") {
    const named = data.cycles.find((c) => c.id === scopedId);
    if (named) return { title: named.name };
  }
  return { title: cycleFilterLabel(filter, data.cycles) };
}

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ cycle?: string | string[] }>;
}) {
  const { workspaceSlug } = await params;
  const sp = await searchParams;
  const data = await serverApi<WorkspaceBootstrap>(
    `/api/workspaces/${encodeURIComponent(workspaceSlug)}/bootstrap`,
    { workspaceSlug }
  );

  if (sp.cycle === undefined) {
    const cycleRows = data.cycles.map((c) => ({
      id: c.id,
      status: c.status,
      startDate: new Date(c.startDate),
      endDate: new Date(c.endDate),
    }));
    if (currentCycleId(cycleRows)) {
      redirect(`${wsPath(data.workspace.slug, "/board")}?cycle=current`);
    }
  }

  const prefs = normalizeBoardDisplayPrefs(data.membership.boardDisplay);
  const query = new URLSearchParams({
    completed: prefs.completed,
    showBacklog: prefs.showBacklog ? "1" : "0",
  });
  const { issues } = await serverApi<{ issues: IssueListItem[] }>(
    `/api/issues?${query}`,
    { workspaceSlug }
  );

  return (
    <Suspense>
      <Board issues={issues} prefs={prefs} />
    </Suspense>
  );
}
