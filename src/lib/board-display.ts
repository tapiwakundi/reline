export const BOARD_DISPLAY_COOKIE = "reline-board-display";

export type BoardCompletedWindow = "all" | "1" | "7" | "30" | "90" | "none";

export type BoardColumnsGroup = "status" | "assignee" | "priority" | "cycle";

export type BoardOrdering = "manual" | "priority" | "created" | "updated" | "title";

export type BoardCardProperty =
    | "id"
    | "priority"
    | "status"
    | "assignee"
    | "labels"
    | "cycle"
    | "estimate"
    | "created"
    | "updated";

export type BoardDisplayPrefs = {
  columns: BoardColumnsGroup;
  ordering: BoardOrdering;
  orderCompletedByRecency: boolean;
  completed: BoardCompletedWindow;
  showBacklog: boolean;
  showEmptyColumns: boolean;
  properties: BoardCardProperty[];
};

export const DEFAULT_BOARD_DISPLAY_PREFS: BoardDisplayPrefs = {
  columns: "status",
  ordering: "manual",
  orderCompletedByRecency: false,
  completed: "7",
  showBacklog: true,
  showEmptyColumns: true,
  properties: ["id", "priority", "assignee", "labels"],
};

export const COMPLETED_OPTIONS: {
  value: BoardCompletedWindow;
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "1", label: "Past day" },
  { value: "7", label: "Past week" },
  { value: "30", label: "Past month" },
  { value: "90", label: "Past 3 months" },
  { value: "none", label: "None" },
];

export const COLUMNS_OPTIONS: { value: BoardColumnsGroup; label: string }[] = [
  { value: "status", label: "Status" },
  { value: "assignee", label: "Assignee" },
  { value: "priority", label: "Priority" },
  { value: "cycle", label: "Cycle" },
];

export const ORDERING_OPTIONS: { value: BoardOrdering; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "priority", label: "Priority" },
  { value: "created", label: "Created" },
  { value: "updated", label: "Updated" },
  { value: "title", label: "Title" },
];

export const CARD_PROPERTY_OPTIONS: {
  value: BoardCardProperty;
  label: string;
}[] = [
  { value: "id", label: "ID" },
  { value: "priority", label: "Priority" },
  { value: "status", label: "Status" },
  { value: "assignee", label: "Assignee" },
  { value: "labels", label: "Labels" },
  { value: "cycle", label: "Cycle" },
  { value: "estimate", label: "Estimate" },
  { value: "created", label: "Created" },
  { value: "updated", label: "Updated" },
];

const COMPLETED_VALUES = new Set<string>(COMPLETED_OPTIONS.map((o) => o.value));
const COLUMNS_VALUES = new Set<string>(COLUMNS_OPTIONS.map((o) => o.value));
const ORDERING_VALUES = new Set<string>(ORDERING_OPTIONS.map((o) => o.value));
const PROPERTY_VALUES = new Set<string>(
  CARD_PROPERTY_OPTIONS.map((o) => o.value)
);

/** `null` = no filter (all); `0` = hide all completed; otherwise days. */
export function completedToDays(
  completed: BoardCompletedWindow
): number | null {
  if (completed === "all") return null;
  if (completed === "none") return 0;
  return Number(completed);
}

export function normalizeBoardDisplayPrefs(
  raw: unknown
): BoardDisplayPrefs {
  const defaults = DEFAULT_BOARD_DISPLAY_PREFS;
  if (raw == null) return { ...defaults, properties: [...defaults.properties] };

  let parsed: Partial<BoardDisplayPrefs>;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw) as Partial<BoardDisplayPrefs>;
    } catch {
      return { ...defaults, properties: [...defaults.properties] };
    }
  } else if (typeof raw === "object") {
    parsed = raw as Partial<BoardDisplayPrefs>;
  } else {
    return { ...defaults, properties: [...defaults.properties] };
  }

  return {
    columns: COLUMNS_VALUES.has(parsed.columns ?? "")
      ? (parsed.columns as BoardColumnsGroup)
      : defaults.columns,
    ordering: ORDERING_VALUES.has(parsed.ordering ?? "")
      ? (parsed.ordering as BoardOrdering)
      : defaults.ordering,
    orderCompletedByRecency:
      typeof parsed.orderCompletedByRecency === "boolean"
        ? parsed.orderCompletedByRecency
        : defaults.orderCompletedByRecency,
    completed: COMPLETED_VALUES.has(parsed.completed ?? "")
      ? (parsed.completed as BoardCompletedWindow)
      : defaults.completed,
    showBacklog:
      typeof parsed.showBacklog === "boolean"
        ? parsed.showBacklog
        : defaults.showBacklog,
    showEmptyColumns:
      typeof parsed.showEmptyColumns === "boolean"
        ? parsed.showEmptyColumns
        : defaults.showEmptyColumns,
    properties: Array.isArray(parsed.properties)
      ? (parsed.properties.filter((p) =>
          PROPERTY_VALUES.has(String(p))
        ) as BoardCardProperty[])
      : [...defaults.properties],
  };
}

