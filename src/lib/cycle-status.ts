export type CycleStatusRow = {
  id: string;
  status: "planned" | "active" | "completed";
  startDate: Date;
  endDate: Date;
};

/**
 * Derive the status to display from the cycle's dates (Linear-style), so
 * cycles whose stored status is stale (e.g. imported sprints) still render
 * correctly: past cycles are Completed, the one containing today is Current.
 */
export function resolveCycleStatuses<T extends CycleStatusRow>(rows: T[]) {
  const now = new Date();
  const storedActive = rows.find(
    (c) => c.status === "active" && c.endDate >= now
  );
  // Without an explicitly active cycle, treat the latest cycle whose window
  // contains today as current.
  const dateCurrent = storedActive
    ? null
    : rows
        .filter(
          (c) =>
            c.status === "planned" && c.startDate <= now && c.endDate >= now
        )
        .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0];

  return (c: T): "planned" | "active" | "completed" => {
    if (c.status === "completed" || c.endDate < now) return "completed";
    if (c.status === "active" || c.id === dateCurrent?.id) return "active";
    return "planned";
  };
}

export function currentCycleId(
  rows: CycleStatusRow[]
): string | null {
  const statusOf = resolveCycleStatuses(rows);
  return rows.find((c) => statusOf(c) === "active")?.id ?? null;
}
