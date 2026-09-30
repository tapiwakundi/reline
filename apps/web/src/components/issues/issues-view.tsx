"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  optimisticBulkUpdateIssues,
  type IssuePatch,
} from "@/lib/optimistic-issues";
import { FiltersBar } from "@/components/filters-bar";
import { MobileNavButton } from "@/components/mobile-nav";
import { StatusIcon } from "@/components/status-icon";
import { IssueRow } from "@/components/issues/issue-row";
import { BulkActionBar } from "@/components/issues/bulk-action-bar";
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
  const { workspace, statuses, cycles } = useWorkspace();
  const { openCreateIssue } = useShortcuts();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const [, startTransition] = useTransition();
  const { data: issues, isPending } = useIssuesList(initialIssues);
  const [filters, setFilters] = useState<IssueFilters>(() =>
    parseFilters(new URLSearchParams(searchParams.toString()))
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const lastClickedId = useRef<string | null>(null);
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
    setSelectedIds(new Set());
    lastClickedId.current = null;
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

  const groups = useMemo(
    () =>
      scopedStatuses
        .map((s) => ({
          status: s,
          items: visible
            .filter((i) => i.statusId === s.id)
            .sort((a, b) => a.priority - b.priority || b.number - a.number),
        }))
        .filter((g) => g.items.length > 0),
    [scopedStatuses, visible]
  );

  const orderedIds = useMemo(
    () => groups.flatMap((g) => g.items.map((i) => i.id)),
    [groups]
  );

  const visibleIdSet = useMemo(() => new Set(orderedIds), [orderedIds]);

  // Drop selections that are no longer in the visible list.
  useEffect(() => {
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (visibleIdSet.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [visibleIdSet]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return;
      }
      setSelectedIds(new Set());
      lastClickedId.current = null;
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function selectIssue(
    issueId: string,
    event: { shiftKey: boolean; checked: boolean }
  ) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (event.shiftKey && lastClickedId.current) {
        const anchor = orderedIds.indexOf(lastClickedId.current);
        const target = orderedIds.indexOf(issueId);
        if (anchor !== -1 && target !== -1) {
          const [start, end] =
            anchor < target ? [anchor, target] : [target, anchor];
          for (let i = start; i <= end; i++) next.add(orderedIds[i]!);
          return next;
        }
      }
      if (event.checked) next.add(issueId);
      else next.delete(issueId);
      return next;
    });
    lastClickedId.current = issueId;
  }

  function toggleGroup(itemIds: string[], selectAll: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of itemIds) {
        if (selectAll) next.add(id);
        else next.delete(id);
      }
      return next;
    });
    lastClickedId.current = itemIds[itemIds.length - 1] ?? null;
  }

  const selectedIssues = useMemo(
    () => orderedIds
      .map((id) => visible.find((i) => i.id === id))
      .filter((i): i is IssueListItem => !!i && selectedIds.has(i.id)),
    [orderedIds, visible, selectedIds]
  );

  function applyBulkPatch(patch: IssuePatch) {
    if (selectedIssues.length === 0) return;
    const targets = selectedIssues.map((i) => ({
      id: i.id,
      identifier: i.identifier,
      statusId: i.statusId,
      cycleId: i.cycleId,
    }));
    setSelectedIds(new Set());
    lastClickedId.current = null;
    startTransition(async () => {
      await optimisticBulkUpdateIssues(
        qc,
        workspace.id,
        targets,
        patch,
        statuses,
        cycles
      );
    });
  }

  if (isPending && !issues) {
    return <IssuesListSkeleton />;
  }

  return (
    <div className="relative flex h-full flex-col">
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
      <div className="flex-1 overflow-y-auto pb-20">
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
          groups.map(({ status, items }) => {
            const itemIds = items.map((i) => i.id);
            const selectedInGroup = itemIds.filter((id) =>
              selectedIds.has(id)
            ).length;
            const allSelected =
              itemIds.length > 0 && selectedInGroup === itemIds.length;
            const someSelected =
              selectedInGroup > 0 && selectedInGroup < itemIds.length;

            return (
              <section key={status.id}>
                <div className="sticky top-0 z-10 flex h-9 items-center gap-2 border-b border-border/60 bg-muted/80 px-4 backdrop-blur">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    aria-label={`Select all in ${status.name}`}
                    onCheckedChange={(checked) => {
                      toggleGroup(itemIds, checked === true);
                    }}
                  />
                  <StatusIcon status={status} />
                  <span className="text-[13px] font-medium">{status.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {items.length}
                  </span>
                </div>
                {items.map((issue) => (
                  <IssueRow
                    key={issue.id}
                    issue={issue}
                    selected={selectedIds.has(issue.id)}
                    onSelect={selectIssue}
                  />
                ))}
              </section>
            );
          })
        )}
      </div>
      {selectedIssues.length > 0 && (
        <BulkActionBar
          selected={selectedIssues}
          onClear={() => {
            setSelectedIds(new Set());
            lastClickedId.current = null;
          }}
          onPatch={applyBulkPatch}
        />
      )}
    </div>
  );
}
