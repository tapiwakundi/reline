"use client";

import Link from "next/link";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CirclePlayIcon,
  HistoryIcon,
  LayoutGridIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspace } from "@/lib/workspace-context";
import { wsPath } from "@/lib/workspace-paths";
import { cn } from "@/lib/utils";
import type { CycleRow } from "@/lib/types";
import {
  cycleFilterLabel,
  defaultCycleIdFromFilters,
  type IssueFilters,
} from "@/lib/filtering";

function CycleStatusIcon({
  status,
  className,
}: {
  status: CycleRow["status"];
  className?: string;
}) {
  if (status === "active") {
    return <CirclePlayIcon className={cn("size-3.5 text-primary", className)} />;
  }
  if (status === "completed") {
    return (
      <HistoryIcon className={cn("size-3.5 text-muted-foreground", className)} />
    );
  }
  return (
    <CirclePlayIcon className={cn("size-3.5 text-muted-foreground", className)} />
  );
}

export function BoardBreadcrumbs({
  filters,
  onCycleChange,
  actions,
}: {
  filters: IssueFilters;
  onCycleChange: (cycleIds: IssueFilters["cycleIds"]) => void;
  actions?: React.ReactNode;
}) {
  const { workspace, cycles } = useWorkspace();

  const scopedCycleId = defaultCycleIdFromFilters(filters, cycles);
  const scopedCycle =
    typeof scopedCycleId === "string"
      ? (cycles.find((c) => c.id === scopedCycleId) ?? null)
      : null;

  const crumbLabel = scopedCycle
    ? scopedCycle.name
    : filters.cycleIds.length === 1
      ? cycleFilterLabel(filters.cycleIds[0]!, cycles)
      : filters.cycleIds.length > 1
        ? "Multiple cycles"
        : "All issues";

  const orderedCycles = [...cycles].sort((a, b) => {
    const rank = { active: 0, planned: 1, completed: 2 } as const;
    const byStatus = rank[a.status] - rank[b.status];
    if (byStatus !== 0) return byStatus;
    return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
  });

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <nav
        aria-label="Breadcrumb"
        className="flex min-w-0 items-center gap-1 text-[13px]"
      >
        <Link
          href={wsPath(workspace.slug, "/board")}
          className="truncate font-medium text-foreground hover:opacity-80"
        >
          {workspace.name}
        </Link>
        <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground/50" />
        <Link
          href={wsPath(workspace.slug, "/cycles")}
          className="shrink-0 font-medium text-foreground hover:opacity-80"
        >
          Cycles
        </Link>
        <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground/50" />
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex max-w-[14rem] items-center gap-1.5 rounded-md px-1 py-0.5 font-medium text-foreground transition-colors hover:bg-foreground/10 data-popup-open:bg-foreground/10">
            {scopedCycle ? (
              <CycleStatusIcon status={scopedCycle.status} />
            ) : (
              <LayoutGridIcon className="size-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="truncate">{crumbLabel}</span>
            <ChevronDownIcon className="size-3 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem
              onClick={() => onCycleChange([])}
              className="gap-2"
            >
              <LayoutGridIcon className="size-3.5 text-muted-foreground" />
              All issues
              {filters.cycleIds.length === 0 && (
                <CheckIcon className="ml-auto size-3.5" />
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {orderedCycles.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                No cycles yet
              </div>
            ) : (
              orderedCycles.map((c) => {
                const selected = scopedCycleId === c.id;
                return (
                  <DropdownMenuItem
                    key={c.id}
                    onClick={() => onCycleChange([c.id])}
                    className="gap-2"
                  >
                    <CycleStatusIcon status={c.status} />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    {selected && <CheckIcon className="size-3.5 shrink-0" />}
                  </DropdownMenuItem>
                );
              })
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
      {actions ? (
        <div className="ml-1 flex shrink-0 items-center gap-0.5">{actions}</div>
      ) : null}
    </div>
  );
}
