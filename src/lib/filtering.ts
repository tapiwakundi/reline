import type { CycleRow, IssueListItem } from "@/lib/types";
import { resolveCycleStatuses } from "@/lib/cycle-status";

export type CycleFilterPreset =
  | "none"
  | "current"
  | "previous"
  | "past"
  | "upcoming"
  | "future";

export type CycleFilter = CycleFilterPreset | (string & {});

export const CYCLE_FILTER_PRESETS: {
  value: CycleFilterPreset;
  label: string;
}[] = [
  { value: "none", label: "No cycle" },
  { value: "past", label: "Any past cycle" },
  { value: "previous", label: "Previous cycle" },
  { value: "current", label: "Current cycle" },
  { value: "upcoming", label: "Upcoming cycle" },
  { value: "future", label: "Any future cycle" },
];

const PRESET_VALUES = new Set<string>(CYCLE_FILTER_PRESETS.map((p) => p.value));

export function isCycleFilterPreset(v: string): v is CycleFilterPreset {
  return PRESET_VALUES.has(v);
}

export type IssueFilters = {
  statusIds: string[];
  priorities: number[];
  assigneeIds: (string | "none")[];
  labelIds: string[];
  cycleIds: CycleFilter[];
};

export const EMPTY_FILTERS: IssueFilters = {
  statusIds: [],
  priorities: [],
  assigneeIds: [],
  labelIds: [],
  cycleIds: [],
};

/** Sentinel in the URL meaning "no cycle filter" (show all). */
export const CYCLE_FILTER_ALL = "all";

export function parseFilters(params: URLSearchParams): IssueFilters {
  return {
    statusIds: params.getAll("status"),
    priorities: params.getAll("priority").map(Number).filter(Number.isFinite),
    assigneeIds: params.getAll("assignee"),
    labelIds: params.getAll("label"),
    cycleIds: params
      .getAll("cycle")
      .filter((v) => v !== CYCLE_FILTER_ALL) as CycleFilter[],
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

/** Like serializeFilters, but keeps an explicit `cycle=all` when unscoped. */
export function serializeBoardFilters(f: IssueFilters): URLSearchParams {
  const p = serializeFilters(f);
  if (f.cycleIds.length === 0) p.set("cycle", CYCLE_FILTER_ALL);
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

export function cycleFilterLabel(
  value: CycleFilter,
  cycles: CycleRow[]
): string {
  const preset = CYCLE_FILTER_PRESETS.find((p) => p.value === value);
  if (preset) return preset.label;
  return cycles.find((c) => c.id === value)?.name ?? "Unknown";
}

/** Expand relative cycle filters into concrete cycle ids (plus `"none"`). */
export function resolveCycleMatchSet(
  filters: CycleFilter[],
  cycles: CycleRow[]
): Set<string> {
  const rows = cycles.map((c) => ({
    id: c.id,
    status: c.status,
    startDate: new Date(c.startDate),
    endDate: new Date(c.endDate),
  }));
  const statusOf = resolveCycleStatuses(rows);
  const withStatus = rows.map((c) => ({ ...c, effective: statusOf(c) }));

  const current = withStatus.find((c) => c.effective === "active") ?? null;
  const previous =
    withStatus
      .filter((c) => c.effective === "completed")
      .sort((a, b) => b.endDate.getTime() - a.endDate.getTime())[0] ?? null;
  const upcoming =
    withStatus
      .filter((c) => c.effective === "planned")
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0] ?? null;

  const match = new Set<string>();
  for (const f of filters) {
    switch (f) {
      case "none":
        match.add("none");
        break;
      case "current":
        if (current) match.add(current.id);
        break;
      case "previous":
        if (previous) match.add(previous.id);
        break;
      case "upcoming":
        if (upcoming) match.add(upcoming.id);
        break;
      case "past":
        for (const c of withStatus) {
          if (c.effective === "completed") match.add(c.id);
        }
        break;
      case "future":
        for (const c of withStatus) {
          if (c.effective === "planned") match.add(c.id);
        }
        break;
      default:
        match.add(f);
    }
  }
  return match;
}

/**
 * When the board is scoped to exactly one concrete cycle, return that id so
 * new issues can default into it. Returns `null` for an explicit "No cycle"
 * filter, and `undefined` when there's no single cycle to assume.
 */
export function defaultCycleIdFromFilters(
  filters: IssueFilters,
  cycles: CycleRow[]
): string | null | undefined {
  if (filters.cycleIds.length === 0) return undefined;
  const match = resolveCycleMatchSet(filters.cycleIds, cycles);
  if (match.size === 0) return undefined;
  if (match.size === 1 && match.has("none")) return null;
  const ids = [...match].filter((id) => id !== "none");
  if (ids.length === 1) return ids[0]!;
  return undefined;
}

export function applyFilters(
  issues: IssueListItem[],
  f: IssueFilters,
  cycles: CycleRow[] = []
): IssueListItem[] {
  const cycleMatch =
    f.cycleIds.length > 0 ? resolveCycleMatchSet(f.cycleIds, cycles) : null;

  return issues.filter((i) => {
    if (f.statusIds.length && !f.statusIds.includes(i.statusId)) return false;
    if (f.priorities.length && !f.priorities.includes(i.priority)) return false;
    if (f.assigneeIds.length) {
      const key = i.assigneeId ?? "none";
      if (!f.assigneeIds.includes(key)) return false;
    }
    if (f.labelIds.length && !f.labelIds.some((l) => i.labelIds.includes(l)))
      return false;
    if (cycleMatch) {
      const key = i.cycleId ?? "none";
      if (!cycleMatch.has(key)) return false;
    }
    return true;
  });
}
