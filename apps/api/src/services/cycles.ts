import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { cycles, issues, statuses, workspaces } from "@/db/schema";
import type { CycleIssueDisposition } from "@reline/shared";
import { cycleNameLabel, defaultCycleName, normalizeCycleName } from "@reline/shared";
import { HttpError, type WorkspaceContext } from "@/lib/context";
import {
  snapCycleDurationDays,
  upcomingCycleWindows,
} from "@/lib/cycle-schedule";

const TARGET_PLANNED_CYCLES = 2;

/**
 * Keep a pipeline of planned cycles. Creates at most enough to reach
 * TARGET_PLANNED_CYCLES, using the closed cycle's 1- or 2-week duration.
 * Returns the soonest planned cycle id (after any inserts).
 */
async function ensureUpcomingCycles(opts: {
  workspaceId: string;
  workspace: { name: string; cycleName: string | null };
  /** Cycle being completed — excluded from the planned pool. */
  excludeCycleId: string;
  durationSource: { startDate: Date; endDate: Date };
}): Promise<string | null> {
  const planned = await db.query.cycles.findMany({
    where: and(
      eq(cycles.workspaceId, opts.workspaceId),
      eq(cycles.status, "planned"),
      ne(cycles.id, opts.excludeCycleId)
    ),
    orderBy: asc(cycles.startDate),
    columns: { id: true, startDate: true, endDate: true },
  });

  const toCreate = Math.max(0, TARGET_PLANNED_CYCLES - planned.length);
  if (toCreate === 0) return planned[0]?.id ?? null;

  const durationDays = snapCycleDurationDays(
    opts.durationSource.startDate,
    opts.durationSource.endDate
  );
  const windows = upcomingCycleWindows({
    durationDays,
    anchorEnd: opts.durationSource.endDate,
    planned,
    count: toCreate,
  });

  let firstCreatedId: string | null = null;
  for (const window of windows) {
    const [ws] = await db
      .update(workspaces)
      .set({ cycleCounter: sql`${workspaces.cycleCounter} + 1` })
      .where(eq(workspaces.id, opts.workspaceId))
      .returning({ counter: workspaces.cycleCounter });

    const [created] = await db
      .insert(cycles)
      .values({
        workspaceId: opts.workspaceId,
        number: ws.counter,
        name: defaultCycleName(opts.workspace, ws.counter),
        startDate: window.startDate,
        endDate: window.endDate,
        status: "planned",
      })
      .returning({ id: cycles.id });

    if (!firstCreatedId) firstCreatedId = created.id;
  }

  return planned[0]?.id ?? firstCreatedId;
}

export async function updateWorkspaceCycleName(
  ctx: WorkspaceContext,
  name: string
) {
  if (ctx.membership.role !== "owner") {
    throw new HttpError(403, "Only the workspace owner can change the cycle name");
  }
  const trimmed = name.trim();
  if (trimmed.length > 80) {
    throw new HttpError(400, "Cycle name must be 80 characters or less");
  }

  const stored = normalizeCycleName(trimmed, ctx.workspace.name);
  const oldLabel = cycleNameLabel(ctx.workspace);
  const newLabel = cycleNameLabel({
    name: ctx.workspace.name,
    cycleName: stored,
  });

  await db
    .update(workspaces)
    .set({ cycleName: stored })
    .where(eq(workspaces.id, ctx.workspace.id));

  if (oldLabel !== newLabel) {
    const rows = await db.query.cycles.findMany({
      where: and(
        eq(cycles.workspaceId, ctx.workspace.id),
        ne(cycles.status, "completed")
      ),
    });
    await Promise.all(
      rows
        .filter((cycle) => cycle.name === `${oldLabel} Cycle ${cycle.number}`)
        .map((cycle) =>
          db
            .update(cycles)
            .set({ name: `${newLabel} Cycle ${cycle.number}` })
            .where(eq(cycles.id, cycle.id))
        )
    );
  }

  return { cycleName: stored };
}

export async function createCycle(ctx: WorkspaceContext, input: {
  name?: string;
  startDate: string;
  endDate: string;
}) {
  const { workspace } = ctx;

  const [ws] = await db
    .update(workspaces)
    .set({ cycleCounter: sql`${workspaces.cycleCounter} + 1` })
    .where(eq(workspaces.id, workspace.id))
    .returning({ counter: workspaces.cycleCounter });

  await db.insert(cycles).values({
    workspaceId: workspace.id,
    number: ws.counter,
    name: input.name?.trim() || defaultCycleName(workspace, ws.counter),
    startDate: new Date(input.startDate),
    endDate: new Date(input.endDate),
  });

}

export async function updateCycle(
  ctx: WorkspaceContext,
  cycleId: string,
  input: { name: string }
) {
  const { workspace } = ctx;
  const name = input.name.trim();
  if (!name) throw new HttpError(400, "Cycle name is required");

  await db
    .update(cycles)
    .set({ name })
    .where(and(eq(cycles.id, cycleId), eq(cycles.workspaceId, workspace.id)));

}

export async function startCycle(ctx: WorkspaceContext, cycleId: string) {
  const { workspace } = ctx;
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
}

/**
 * Manually complete a cycle. Done/Canceled issues stay on the cycle for
 * history. In-progress and pending issues follow the chosen disposition.
 * Always tops up the planned pipeline to two upcoming cycles.
 */
export async function completeCycle(
  ctx: WorkspaceContext,
  cycleId: string,
  options: {
    inProgress: CycleIssueDisposition;
    pending: CycleIssueDisposition;
    nextCycleId?: string | null;
  }
) {
  const { workspace } = ctx;

  const cycle = await db.query.cycles.findFirst({
    where: and(eq(cycles.id, cycleId), eq(cycles.workspaceId, workspace.id)),
  });
  if (!cycle) throw new HttpError(404, "Cycle not found");
  if (cycle.status === "completed") throw new HttpError(400, "Cycle already completed");

  const soonestPlannedId = await ensureUpcomingCycles({
    workspaceId: workspace.id,
    workspace,
    excludeCycleId: cycleId,
    durationSource: {
      startDate: cycle.startDate,
      endDate: cycle.endDate,
    },
  });

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
      if (!next) throw new HttpError(404, "Next cycle not found");
      nextCycleId = next.id;
    } else {
      nextCycleId = soonestPlannedId;
      if (!nextCycleId) {
        throw new HttpError(400, "No upcoming cycle to move issues into");
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

}

export async function deleteCycle(ctx: WorkspaceContext, cycleId: string) {
  const { workspace } = ctx;
  await db
    .delete(cycles)
    .where(and(eq(cycles.id, cycleId), eq(cycles.workspaceId, workspace.id)));
}
