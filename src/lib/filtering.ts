import type { IssueListItem } from "@/lib/types";

export type IssueFilters = {
  statusIds: string[];
  priorities: number[];
  assigneeIds: (string | "none")[];
  labelIds: string[];
  cycleIds: (string | "none")[];
};

export const EMPTY_FILTERS: IssueFilters = {
  statusIds: [],
  priorities: [],
  assigneeIds: [],
  labelIds: [],
  cycleIds: [],
};

export function parseFilters(params: URLSearchParams): IssueFilters {
  return {
    statusIds: params.getAll("status"),
    priorities: params.getAll("priority").map(Number).filter(Number.isFinite),
    assigneeIds: params.getAll("assignee"),
    labelIds: params.getAll("label"),
    cycleIds: params.getAll("cycle"),
  };
}

export function serializeFilters(f: IssueFilters): URLSearchParams {
  const p = new URLSearchParams();
  f.statusIds.forEach((v) => p.append("status", v));
  f.priorities.forEach((v) => p.append("priority", String(v)));
  f.assigneeIds.forEach((v) => p.append("assignee", v));
  f.labelIds.forEach((v) => p.append("label", v));
  f.cycleIds.forEach((v) => p.append("cycle", v));
  return p;
}

export function hasActiveFilters(f: IssueFilters) {
  return (
    f.statusIds.length > 0 ||
    f.priorities.length > 0 ||
    f.assigneeIds.length > 0 ||
    f.labelIds.length > 0 ||
    f.cycleIds.length > 0
  );
}

export function applyFilters(
  issues: IssueListItem[],
  f: IssueFilters
): IssueListItem[] {
  return issues.filter((i) => {
    if (f.statusIds.length && !f.statusIds.includes(i.statusId)) return false;
    if (f.priorities.length && !f.priorities.includes(i.priority)) return false;
    if (f.assigneeIds.length) {
      const key = i.assigneeId ?? "none";
      if (!f.assigneeIds.includes(key)) return false;
    }
    if (f.labelIds.length && !f.labelIds.some((l) => i.labelIds.includes(l)))
      return false;
    if (f.cycleIds.length) {
      const key = i.cycleId ?? "none";
      if (!f.cycleIds.includes(key)) return false;
    }
    return true;
  });
}
