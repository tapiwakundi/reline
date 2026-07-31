"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { cycles, issues, statuses, workspaces } from "@/db/schema";
import { requireWorkspace } from "@/lib/session";

function revalidateCycleViews() {
  revalidatePath("/cycles");
  revalidatePath("/board");
  revalidatePath("/issues");
}

export async function createCycle(input: {
  name?: string;
  startDate: string;
  endDate: string;
}) {
  const { workspace } = await requireWorkspace();

  const [ws] = await db
    .update(workspaces)
    .set({ cycleCounter: sql`${workspaces.cycleCounter} + 1` })
    .where(eq(workspaces.id, workspace.id))
    .returning({ counter: workspaces.cycleCounter });

  await db.insert(cycles).values({
    workspaceId: workspace.id,
    number: ws.counter,
    name: input.name?.trim() || `Cycle ${ws.counter}`,
    startDate: new Date(input.startDate),
    endDate: new Date(input.endDate),
  });

  revalidateCycleViews();
}

export async function startCycle(cycleId: string) {
  const { workspace } = await requireWorkspace();
  // Only one active cycle at a time
  await db
    .update(cycles)
    .set({ status: "planned" })
    .where(
      and(
        eq(cycles.workspaceId, workspace.id),
        eq(cycles.status, "active"),
        ne(cycles.id, cycleId)
      )
    );
  await db
    .update(cycles)
    .set({ status: "active" })
    .where(and(eq(cycles.id, cycleId), eq(cycles.workspaceId, workspace.id)));
  revalidateCycleViews();
}

/**
 * Complete a cycle. Issues that are Done/Canceled keep their status; anything
 * unfinished is detached from the cycle (back to the general pool).
 */
export async function completeCycle(cycleId: string) {
  const { workspace } = await requireWorkspace();

  const doneish = await db.query.statuses.findMany({
    where: and(
      eq(statuses.workspaceId, workspace.id),
      inArray(statuses.type, ["done", "canceled"])
    ),
  });
  const doneIds = doneish.map((s) => s.id);

  const cycleIssues = await db.query.issues.findMany({
    where: and(eq(issues.cycleId, cycleId), eq(issues.workspaceId, workspace.id)),
    columns: { id: true, statusId: true },
  });
  const unfinished = cycleIssues
    .filter((i) => !doneIds.includes(i.statusId))
    .map((i) => i.id);

  if (unfinished.length) {
    await db
      .update(issues)
      .set({ cycleId: null, updatedAt: new Date() })
      .where(inArray(issues.id, unfinished));
  }

  await db
    .update(cycles)
    .set({ status: "completed" })
    .where(and(eq(cycles.id, cycleId), eq(cycles.workspaceId, workspace.id)));

  revalidateCycleViews();
}

export async function deleteCycle(cycleId: string) {
  const { workspace } = await requireWorkspace();
  await db
    .delete(cycles)
    .where(and(eq(cycles.id, cycleId), eq(cycles.workspaceId, workspace.id)));
  revalidateCycleViews();
}
