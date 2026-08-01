"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace-context";
import { useShortcuts } from "@/components/global-shortcuts";
import { useIssuesList } from "@/lib/hooks/queries";
import type { IssueListItem } from "@/lib/types";
import {
  applyFilters,
  parseFilters,
  serializeFilters,
  type IssueFilters,
} from "@/lib/filtering";
import { FiltersBar } from "@/components/filters-bar";
import { MobileNavButton } from "@/components/mobile-nav";
import { StatusIcon } from "@/components/status-icon";
import { IssueRow } from "@/components/issues/issue-row";
import { IssuesListSkeleton } from "@/components/skeletons/page-skeletons";

export function IssuesView({
  issues: initialIssues,
  title,
  fixedAssigneeId,
  fixedStatusType,
}: {
  issues: IssueListItem[];
  title: string;
  fixedAssigneeId?: string;
  /** When set, only show issues in statuses of this type (e.g. backlog). */
  fixedStatusType?: "backlog" | "unstarted" | "started" | "done" | "canceled";
}) {
  const { statuses, cycles } = useWorkspace();
  const { openCreateIssue } = useShortcuts();
  const searchParams = useSearchParams();
  const { data: issues, isPending } = useIssuesList(initialIssues);
  const [filters, setFilters] = useState<IssueFilters>(() =>
    parseFilters(new URLSearchParams(searchParams.toString()))
  );
  const list = issues ?? initialIssues;

  const scopedStatuses = useMemo(
    () =>
      fixedStatusType
        ? statuses.filter((s) => s.type === fixedStatusType)
        : statuses,
    [statuses, fixedStatusType]
  );
  // Only pin a status when the view is scoped (e.g. Backlog); otherwise the
  // create dialog defaults to backlog on its own.
  const defaultStatusId = fixedStatusType
    ? scopedStatuses[0]?.id
    : undefined;

  function onFiltersChange(f: IssueFilters) {
    setFilters(f);
    const qs = serializeFilters(f).toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
  }

  const visible = useMemo(() => {
    let rows = applyFilters(list, filters, cycles);
    if (fixedAssigneeId) rows = rows.filter((i) => i.assigneeId === fixedAssigneeId);
    if (fixedStatusType) {
      const ids = new Set(scopedStatuses.map((s) => s.id));
      rows = rows.filter((i) => ids.has(i.statusId));
    }
    return rows;
  }, [list, filters, cycles, fixedAssigneeId, fixedStatusType, scopedStatuses]);

  const groups = scopedStatuses
    .map((s) => ({
      status: s,
      items: visible
        .filter((i) => i.statusId === s.id)
        .sort((a, b) => a.priority - b.priority || b.number - a.number),
    }))
    .filter((g) => g.items.length > 0);

  if (isPending && !issues) {
    return <IssuesListSkeleton />;
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-4 py-1.5">
        <MobileNavButton />
        <h1 className="text-sm font-semibold">{title}</h1>
        <span className="text-xs text-muted-foreground">{visible.length}</span>
        <FiltersBar
          filters={filters}
          onChange={onFiltersChange}
          hideAssignee={!!fixedAssigneeId}
        />
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => openCreateIssue({ statusId: defaultStatusId })}
          >
            <PlusIcon className="size-3.5" />
            New issue
          </Button>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">No issues here yet.</p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => openCreateIssue({ statusId: defaultStatusId })}
            >
              Create an issue
            </Button>
          </div>
        ) : (
          groups.map(({ status, items }) => (
            <section key={status.id}>
              <div className="sticky top-0 z-10 flex h-9 items-center gap-2 border-b border-border/60 bg-muted/80 px-4 backdrop-blur">
                <StatusIcon status={status} />
                <span className="text-[13px] font-medium">{status.name}</span>
                <span className="text-xs text-muted-foreground">
                  {items.length}
                </span>
              </div>
              {items.map((issue) => (
                <IssueRow key={issue.id} issue={issue} />
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
