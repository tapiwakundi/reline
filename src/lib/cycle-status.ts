export type CycleStatusRow = {
  id: string;
  status: "planned" | "active" | "completed";
  startDate: Date;
  endDate: Date;
};

/**
 * Cycle status is manual only — cycles stay planned/active until explicitly
 * completed. Dates are informational and do not auto-close a cycle.
 */
export function resolveCycleStatuses<T extends CycleStatusRow>(_rows: T[]) {
  return (c: T): "planned" | "active" | "completed" => c.status;
}

export function currentCycleId(rows: CycleStatusRow[]): string | null {
  return rows.find((c) => c.status === "active")?.id ?? null;
}
