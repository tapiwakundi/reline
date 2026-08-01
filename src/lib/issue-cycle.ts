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
