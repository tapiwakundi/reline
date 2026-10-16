import { and, asc, count, eq, sql } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgTransaction } from "drizzle-orm/pg-core";
import {
  isCompletedStatusType,
  isStatusType,
  nextStatusPosition,
  normalizeStatusColor,
  parseStatusName,
  statusOrderUpdate,
  type StatusRow,
  type StatusType,
  type WorkspaceStatus,
} from "@reline/shared";
import { db } from "@/db";
import type * as schema from "@/db/schema";
import {
  activities,
  issues,
  slackInstallations,
  statuses,
} from "@/db/schema";
import { HttpError, type WorkspaceContext } from "@/lib/context";
import { getWorkspaceStatuses } from "@/lib/queries";
import { setIssueSlackChannelArchived } from "@/services/slack";

type Tx = PgTransaction<
  NodePgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

function requireOwner(ctx: WorkspaceContext) {
  if (ctx.membership.role !== "owner") {
    throw new HttpError(403, "Only the workspace owner can change columns");
  }
}

function toStatusRow(row: typeof statuses.$inferSelect): StatusRow {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    color: row.color,
    position: row.position,
  };
}

function isPgCode(error: unknown, code: string): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current as { code?: unknown; cause?: unknown };
    if (record.code === code) return true;
    current = record.cause;
  }
  return false;
}

async function lockColumns(tx: Tx, workspaceId: string): Promise<StatusRow[]> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`statuses:${workspaceId}`}))`
  );
  const rows = await tx
    .select()
    .from(statuses)
    .where(eq(statuses.workspaceId, workspaceId))
    .orderBy(asc(statuses.position));
  return rows.map(toStatusRow);
}

function parseColumnInput(
  existing: StatusRow[],
  input: { name?: string; type?: string; color?: string },
  ignoreId?: string
): { name?: string; type?: StatusType; color?: string } {
  const patch: { name?: string; type?: StatusType; color?: string } = {};
  if (input.name !== undefined) {
    const parsed = parseStatusName(input.name, existing, ignoreId);
    if (!parsed.ok) throw new HttpError(400, parsed.error);
    patch.name = parsed.name;
  }
  if (input.type !== undefined) {
    if (!isStatusType(input.type)) {
      throw new HttpError(400, "Choose a column category");
    }
    patch.type = input.type;
  }
  if (input.color !== undefined) {
    const color = normalizeStatusColor(input.color);
    if (!color) throw new HttpError(400, "Choose a column color");
    patch.color = color;
  }
  return patch;
}

async function syncSlackArchive(
  workspaceId: string,
  issueIds: string[],
  archived: boolean
) {
  if (issueIds.length === 0) return;
  const installation = await db.query.slackInstallations.findFirst({
    where: eq(slackInstallations.workspaceId, workspaceId),
    columns: { id: true },
  });
  if (!installation) return;
  for (const issueId of issueIds) {
    try {
      await setIssueSlackChannelArchived({ workspaceId, issueId, archived });
    } catch (error) {
      console.error("[slack]", error);
    }
  }
}

export async function createStatus(
  ctx: WorkspaceContext,
  input: { name: string; type: string; color: string }
): Promise<WorkspaceStatus[]> {
  requireOwner(ctx);
  const workspaceId = ctx.workspace.id;
  try {
    await db.transaction(async (tx) => {
      const existing = await lockColumns(tx, workspaceId);
      const patch = parseColumnInput(existing, input);
      if (!patch.name || !patch.type || !patch.color) {
        throw new HttpError(400, "Column name, category, and color are required");
      }
      const [created] = await tx
        .insert(statuses)
        .values({
          workspaceId,
          name: patch.name,
          type: patch.type,
          color: patch.color,
          position: nextStatusPosition(existing),
        })
        .returning();
      if (!created) throw new HttpError(500, "Could not add column");
    });
    return getWorkspaceStatuses(workspaceId);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (isPgCode(error, "23505")) {
      throw new HttpError(400, "A column with that name already exists");
    }
    throw error;
  }
}

export async function updateStatus(
  ctx: WorkspaceContext,
  id: string,
  input: { name?: string; type?: string; color?: string }
): Promise<WorkspaceStatus[]> {
  requireOwner(ctx);
  const workspaceId = ctx.workspace.id;

  try {
    const archive = await db.transaction(async (tx) => {
      const existing = await lockColumns(tx, workspaceId);
      const current = existing.find((status) => status.id === id);
      if (!current) throw new HttpError(404, "Column not found");
      const patch = parseColumnInput(existing, input, id);
      if (!patch.name && !patch.type && !patch.color) return null;

      const [row] = await tx
        .update(statuses)
        .set(patch)
        .where(and(eq(statuses.id, id), eq(statuses.workspaceId, workspaceId)))
        .returning();
      if (!row) throw new HttpError(404, "Column not found");

      const next = toStatusRow(row);
      if (
        !patch.type ||
        isCompletedStatusType(current.type) === isCompletedStatusType(next.type)
      ) {
        return null;
      }

      const inColumn = await tx
        .select({ id: issues.id })
        .from(issues)
        .where(and(eq(issues.workspaceId, workspaceId), eq(issues.statusId, id)));
      return {
        issueIds: inColumn.map((issue) => issue.id),
        archived: isCompletedStatusType(next.type),
      };
    });

    if (archive) {
      await syncSlackArchive(workspaceId, archive.issueIds, archive.archived);
    }
    return getWorkspaceStatuses(workspaceId);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (isPgCode(error, "23505")) {
      throw new HttpError(400, "A column with that name already exists");
    }
    throw error;
  }
}

export async function reorderStatuses(
  ctx: WorkspaceContext,
  orderedIds: string[]
): Promise<WorkspaceStatus[]> {
  requireOwner(ctx);
  const workspaceId = ctx.workspace.id;
  await db.transaction(async (tx) => {
    const existing = await lockColumns(tx, workspaceId);
    const order = statusOrderUpdate(
      existing.map((status) => status.id),
      orderedIds
    );
    if (!order.ok) throw new HttpError(400, order.error);

    for (const row of order.positions) {
      const updated = await tx
        .update(statuses)
        .set({ position: row.position })
        .where(
          and(eq(statuses.id, row.id), eq(statuses.workspaceId, workspaceId))
        )
        .returning({ id: statuses.id });
      if (updated.length !== 1) {
        throw new HttpError(400, "Column order is out of date. Refresh and try again.");
      }
    }

  });
  return getWorkspaceStatuses(workspaceId);
}

export async function deleteStatus(
  ctx: WorkspaceContext,
  id: string,
  moveToId?: string
): Promise<WorkspaceStatus[]> {
  requireOwner(ctx);
  const workspaceId = ctx.workspace.id;
  let archive: { issueIds: string[]; archived: boolean } | null = null;

  try {
    archive = await db.transaction(async (tx) => {
      const existing = await lockColumns(tx, workspaceId);
      const current = existing.find((status) => status.id === id);
      if (!current) throw new HttpError(404, "Column not found");
      if (existing.length < 2) {
        throw new HttpError(400, "A workspace needs at least one column");
      }

      const [countRow] = await tx
        .select({ value: count() })
        .from(issues)
        .where(and(eq(issues.workspaceId, workspaceId), eq(issues.statusId, id)));
      const issueCount = Number(countRow?.value ?? 0);
      const destination = existing.find((status) => status.id === moveToId);
      let target: StatusRow | undefined;
      if (issueCount > 0) {
        if (!destination || destination.id === id) {
          throw new HttpError(400, "Choose a column to move these issues into");
        }
        target = destination;
      }

      let moved: { id: string }[] = [];
      if (target) {
        const intoBacklog = target.type === "backlog";
        moved = await tx
          .update(issues)
          .set({
            statusId: target.id,
            updatedAt: new Date(),
            ...(intoBacklog ? { cycleId: null } : {}),
          })
          .where(and(eq(issues.workspaceId, workspaceId), eq(issues.statusId, id)))
          .returning({ id: issues.id });

        if (moved.length) {
          await tx.insert(activities).values(
            moved.map((issue) => ({
              issueId: issue.id,
              actorId: ctx.user.id,
              type: "status_changed",
              data: { from: current.name, to: target.name },
            }))
          );
        }
      }

      const deleted = await tx
        .delete(statuses)
        .where(and(eq(statuses.id, id), eq(statuses.workspaceId, workspaceId)))
        .returning({ id: statuses.id });
      if (!deleted.length) throw new HttpError(404, "Column not found");

      if (
        !target ||
        isCompletedStatusType(current.type) === isCompletedStatusType(target.type)
      ) {
        return null;
      }
      return {
        issueIds: moved.map((issue) => issue.id),
        archived: isCompletedStatusType(target.type),
      };
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (isPgCode(error, "23503")) {
      throw new HttpError(400, "Issues are still in this column. Try again.");
    }
    throw error;
  }

  if (archive) {
    await syncSlackArchive(workspaceId, archive.issueIds, archive.archived);
  }
  return getWorkspaceStatuses(workspaceId);
}
