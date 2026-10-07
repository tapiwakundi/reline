import { currentCycleId, type CycleStatusRow } from "./cycle-status";

/**
 * When an issue leaves Backlog into a cycle, promote it to Todo (unstarted).
 * Returns the Todo status id, or undefined if no change is needed.
 */
export function todoStatusIdForCycleEntry(
  statuses: { id: string; type: string }[],
  currentStatusId: string,
  cycleId: string | null | undefined
): string | undefined {
  if (!cycleId) return undefined;
  const current = statuses.find((s) => s.id === currentStatusId);
  if (current?.type !== "backlog") return undefined;
  return statuses.find((s) => s.type === "unstarted")?.id;
}

/**
 * When an issue moves from Backlog to Todo, assign it to the current cycle.
 * Returns the current cycle id, or undefined if no change is needed.
 */
export function cycleIdForTodoEntry(
  statuses: { id: string; type: string }[],
  currentStatusId: string,
  nextStatusId: string,
  existingCycleId: string | null | undefined,
  activeCycleId: string | null
): string | undefined {
  if (!activeCycleId) return undefined;
  if (existingCycleId) return undefined;
  const from = statuses.find((s) => s.id === currentStatusId);
  const to = statuses.find((s) => s.id === nextStatusId);
  if (from?.type !== "backlog") return undefined;
  if (to?.type !== "unstarted") return undefined;
  return activeCycleId;
}

/**
 * When an issue moves into Backlog, clear its cycle.
 * Returns `null` to clear, or `undefined` if no change is needed.
 */
export function cycleIdForBacklogEntry(
  statuses: { id: string; type: string }[],
  nextStatusId: string,
  existingCycleId: string | null | undefined
): null | undefined {
  if (existingCycleId == null) return undefined;
  const to = statuses.find((s) => s.id === nextStatusId);
  if (to?.type !== "backlog") return undefined;
  return null;
}

/**
 * Cycle change implied by a status move.
 * - Entering Backlog clears the cycle (`null`).
 * - Leaving Backlog for Todo assigns `targetCycleId`.
 * - When `assignAnyStatus` is set, leaving Backlog for any other status also
 *   assigns `targetCycleId` (a cycle board: the card joined this sprint).
 * - `undefined` means the existing cycle stays as it is.
 */
export function cycleIdAfterStatusChange(
  statuses: { id: string; type: string }[],
  currentStatusId: string,
  nextStatusId: string,
  existingCycleId: string | null | undefined,
  targetCycleId: string | null,
  assignAnyStatus = false
): string | null | undefined {
  const cleared = cycleIdForBacklogEntry(
    statuses,
    nextStatusId,
    existingCycleId
  );
  if (cleared === null) return null;

  const todo = cycleIdForTodoEntry(
    statuses,
    currentStatusId,
    nextStatusId,
    existingCycleId,
    targetCycleId
  );
  if (todo) return todo;

  if (!assignAnyStatus || !targetCycleId || existingCycleId) return undefined;
  const from = statuses.find((s) => s.id === currentStatusId);
  const to = statuses.find((s) => s.id === nextStatusId);
  if (from?.type !== "backlog") return undefined;
  if (!to || to.type === "backlog") return undefined;
  return targetCycleId;
}

/** Resolve the workspace's current (active) cycle id from cycle rows. */
export function activeCycleIdFromRows(
  cycles: {
    id: string;
    status: CycleStatusRow["status"];
    startDate: string | Date;
    endDate: string | Date;
  }[]
): string | null {
  return currentCycleId(
    cycles.map((c) => ({
      id: c.id,
      status: c.status,
      startDate:
        c.startDate instanceof Date ? c.startDate : new Date(c.startDate),
      endDate: c.endDate instanceof Date ? c.endDate : new Date(c.endDate),
    }))
  );
}
