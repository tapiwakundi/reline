import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { cycles, issues, statuses } from "@/db/schema";
import { requireWorkspace } from "@/lib/session";
import { resolveCycleStatuses } from "@/lib/cycle-status";
import { CyclesView } from "@/components/cycles/cycles-view";

export default async function CyclesPage() {
  const { workspace } = await requireWorkspace();

  const [cycleRows, issueRows, statusRows] = await Promise.all([
    db.query.cycles.findMany({
      where: eq(cycles.workspaceId, workspace.id),
      orderBy: asc(cycles.startDate),
    }),
    db.query.issues.findMany({
      where: eq(issues.workspaceId, workspace.id),
      columns: { id: true, cycleId: true, statusId: true, estimate: true },
    }),
    db.query.statuses.findMany({
      where: eq(statuses.workspaceId, workspace.id),
    }),
  ]);

  const statusType = new Map(statusRows.map((s) => [s.id, s.type]));
  const statusOf = resolveCycleStatuses(cycleRows);

  return (
    <CyclesView
      cycles={cycleRows.map((c) => {
        const inCycle = issueRows.filter((i) => i.cycleId === c.id);
        let done = 0;
        let started = 0;
        let estimateTotal = 0;
        let estimateDone = 0;
        for (const i of inCycle) {
          const type = statusType.get(i.statusId);
          const est = i.estimate ?? 0;
          estimateTotal += est;
          if (type === "done" || type === "canceled") {
            done++;
            estimateDone += est;
          } else if (type === "started") {
            started++;
          }
        }
        return {
          id: c.id,
          number: c.number,
          name: c.name,
          startDate: c.startDate.toISOString(),
          endDate: c.endDate.toISOString(),
          status: statusOf(c),
          total: inCycle.length,
          done,
          started,
          estimateTotal,
          estimateDone,
        };
      })}
    />
  );
}
