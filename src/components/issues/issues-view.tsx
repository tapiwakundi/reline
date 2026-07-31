"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/lib/workspace-context";
import { useShortcuts } from "@/components/global-shortcuts";
import type { IssueListItem } from "@/lib/types";
import {
  applyFilters,
  parseFilters,
  serializeFilters,
  type IssueFilters,
} from "@/lib/filtering";
import { FiltersBar } from "@/components/filters-bar";
import { StatusIcon } from "@/components/status-icon";
import { IssueRow } from "@/components/issues/issue-row";

export function IssuesView({
  issues,
  title,
  fixedAssigneeId,
}: {
  issues: IssueListItem[];
  title: string;
  fixedAssigneeId?: string;
}) {
  const { statuses } = useWorkspace();
  const { openCreateIssue } = useShortcuts();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<IssueFilters>(() =>
    parseFilters(new URLSearchParams(searchParams.toString()))
  );

  function onFiltersChange(f: IssueFilters) {
    setFilters(f);
    const qs = serializeFilters(f).toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
  }

  const visible = useMemo(() => {
    let list = applyFilters(issues, filters);
    if (fixedAssigneeId) list = list.filter((i) => i.assigneeId === fixedAssigneeId);
    return list;
  }, [issues, filters, fixedAssigneeId]);

  const groups = statuses
    .map((s) => ({
      status: s,
      items: visible
        .filter((i) => i.statusId === s.id)
        .sort((a, b) => a.priority - b.priority || b.number - a.number),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <h1 className="text-sm font-semibold">{title}</h1>
        <span className="text-xs text-muted-foreground">{visible.length}</span>
        <div className="ml-auto flex items-center gap-2">
          <FiltersBar
            filters={filters}
            onChange={onFiltersChange}
            hideAssignee={!!fixedAssigneeId}
          />
          <Button size="sm" className="h-7 gap-1 text-xs" onClick={openCreateIssue}>
            <PlusIcon className="size-3.5" />
            New issue
          </Button>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">No issues here yet.</p>
            <Button size="sm" variant="secondary" onClick={openCreateIssue}>
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
