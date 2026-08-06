"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { cycles, issues, statuses, workspaces } from "@/db/schema";
import { requireWorkspace } from "@/lib/session";
import { wsPath } from "@/lib/workspace-paths";

function revalidateCycleViews(slug: string) {
  revalidatePath(wsPath(slug, "/cycles"));
  revalidatePath(wsPath(slug, "/board"));
  revalidatePath(wsPath(slug, "/issues"));
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

  revalidateCycleViews(workspace.slug);
}

export async function updateCycle(
  cycleId: string,
  input: { name: string }
) {
  const { workspace } = await requireWorkspace();
  const name = input.name.trim();
  if (!name) throw new Error("Cycle name is required");

  await db
    .update(cycles)
    .set({ name })
    .where(and(eq(cycles.id, cycleId), eq(cycles.workspaceId, workspace.id)));

  revalidateCycleViews(workspace.slug);
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
  revalidateCycleViews(workspace.slug);
}

/** What to do with unfinished issues when closing a cycle. */
export type CycleIssueDisposition = "next" | "backlog" | "keep";

/**
 * Manually complete a cycle. Done/Canceled issues stay on the cycle for
 * history. In-progress and pending issues follow the chosen disposition.
 */
export async function completeCycle(
  cycleId: string,
  options: {
    inProgress: CycleIssueDisposition;
    pending: CycleIssueDisposition;
    nextCycleId?: string | null;
  }
) {
  const { workspace } = await requireWorkspace();

  const cycle = await db.query.cycles.findFirst({
    where: and(eq(cycles.id, cycleId), eq(cycles.workspaceId, workspace.id)),
  });
  if (!cycle) throw new Error("Cycle not found");
  if (cycle.status === "completed") throw new Error("Cycle already completed");

  const needsNext =
    options.inProgress === "next" || options.pending === "next";
  let nextCycleId: string | null = null;
  if (needsNext) {
    if (options.nextCycleId) {
      const next = await db.query.cycles.findFirst({
        where: and(
          eq(cycles.id, options.nextCycleId),
          eq(cycles.workspaceId, workspace.id),
          ne(cycles.id, cycleId),
          ne(cycles.status, "completed")
        ),
      });
      if (!next) throw new Error("Next cycle not found");
      nextCycleId = next.id;
    } else {
      const [upcoming] = await db.query.cycles.findMany({
        where: and(
          eq(cycles.workspaceId, workspace.id),
          eq(cycles.status, "planned"),
          ne(cycles.id, cycleId)
        ),
        orderBy: asc(cycles.startDate),
        limit: 1,
      });
      nextCycleId = upcoming?.id ?? null;
      if (!nextCycleId) {
        throw new Error("No upcoming cycle to move issues into");
      }
    }
  }

  const workspaceStatuses = await db.query.statuses.findMany({
    where: eq(statuses.workspaceId, workspace.id),
    columns: { id: true, type: true },
  });
  const typeById = new Map(workspaceStatuses.map((s) => [s.id, s.type]));

  const cycleIssues = await db.query.issues.findMany({
    where: and(
      eq(issues.cycleId, cycleId),
      eq(issues.workspaceId, workspace.id)
    ),
    columns: { id: true, statusId: true },
  });

  const inProgressIds: string[] = [];
  const pendingIds: string[] = [];
  for (const issue of cycleIssues) {
    const type = typeById.get(issue.statusId);
    if (type === "done" || type === "canceled") continue;
    if (type === "started") inProgressIds.push(issue.id);
    else pendingIds.push(issue.id);
  }

  async function applyDisposition(
    ids: string[],
    disposition: CycleIssueDisposition
  ) {
    if (!ids.length || disposition === "keep") return;
    const cycleTarget = disposition === "next" ? nextCycleId : null;
    await db
      .update(issues)
      .set({ cycleId: cycleTarget, updatedAt: new Date() })
      .where(inArray(issues.id, ids));
  }

  await applyDisposition(inProgressIds, options.inProgress);
  await applyDisposition(pendingIds, options.pending);

  await db
    .update(cycles)
    .set({ status: "completed" })
    .where(and(eq(cycles.id, cycleId), eq(cycles.workspaceId, workspace.id)));

  revalidateCycleViews(workspace.slug);
}

export async function deleteCycle(cycleId: string) {
  const { workspace } = await requireWorkspace();
  await db
    .delete(cycles)
    .where(and(eq(cycles.id, cycleId), eq(cycles.workspaceId, workspace.id)));
  revalidateCycleViews(workspace.slug);
}
