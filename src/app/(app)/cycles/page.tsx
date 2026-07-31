import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { cycles, issues, statuses } from "@/db/schema";
import { requireWorkspace } from "@/lib/session";
import { CyclesView } from "@/components/cycles/cycles-view";

export default async function CyclesPage() {
  const { workspace } = await requireWorkspace();

  const [cycleRows, issueRows, statusRows] = await Promise.all([
    db.query.cycles.findMany({
      where: eq(cycles.workspaceId, workspace.id),
      orderBy: asc(cycles.number),
    }),
    db.query.issues.findMany({
      where: eq(issues.workspaceId, workspace.id),
      columns: { id: true, cycleId: true, statusId: true },
    }),
    db.query.statuses.findMany({
      where: eq(statuses.workspaceId, workspace.id),
    }),
  ]);

  const doneIds = statusRows
    .filter((s) => s.type === "done" || s.type === "canceled")
    .map((s) => s.id);

  return (
    <CyclesView
      cycles={cycleRows.map((c) => {
        const inCycle = issueRows.filter((i) => i.cycleId === c.id);
        return {
          id: c.id,
          number: c.number,
          name: c.name,
          startDate: c.startDate.toISOString(),
          endDate: c.endDate.toISOString(),
          status: c.status,
          total: inCycle.length,
          done: inCycle.filter((i) => doneIds.includes(i.statusId)).length,
        };
      })}
    />
  );
}
