"use client";

import { Button } from "@/components/ui/button";
import {
  AssigneePicker,
  CyclePicker,
  PriorityPicker,
  StatusPicker,
} from "@/components/pickers";
import type { IssuePatch } from "@/lib/optimistic-issues";
import type { IssueListItem } from "@/lib/types";

export function BulkActionBar({
  selected,
  onClear,
  onPatch,
}: {
  selected: IssueListItem[];
  onClear: () => void;
  onPatch: (patch: IssuePatch) => void;
}) {
  const first = selected[0];
  if (!first) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-4">
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-lg border border-border bg-popover px-3 py-2 shadow-md ring-1 ring-foreground/10">
        <span className="text-xs font-medium tabular-nums">
          {selected.length} selected
        </span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="text-muted-foreground"
          onClick={onClear}
        >
          Clear
        </Button>
        <div className="mx-0.5 h-4 w-px bg-border" />
        <StatusPicker
          value={first.statusId}
          onChange={(statusId) => onPatch({ statusId })}
        />
        <PriorityPicker
          value={first.priority}
          onChange={(priority) => onPatch({ priority })}
        />
        <AssigneePicker
          value={first.assigneeId}
          onChange={(assigneeId) => onPatch({ assigneeId })}
        />
        <CyclePicker
          value={first.cycleId}
          onChange={(cycleId) => onPatch({ cycleId })}
          placeholder="Cycle"
        />
      </div>
    </div>
  );
}
