"use client";

import {
  WorkspaceTrail,
} from "@/components/workspace-trail";
import type { IssueFilters } from "@/lib/filtering";

export function BoardBreadcrumbs({
  filters,
  onCycleChange,
  actions,
}: {
  filters: IssueFilters;
  onCycleChange: (cycleIds: IssueFilters["cycleIds"]) => void;
  actions?: React.ReactNode;
}) {
  return (
    <WorkspaceTrail
      filters={filters}
      onCycleChange={onCycleChange}
      actions={actions}
    />
  );
}
