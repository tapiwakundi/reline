import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { labels } from "@/db/schema";
import { HttpError, type WorkspaceContext } from "@/lib/context";

export async function createLabel(
  ctx: WorkspaceContext,
  name: string,
  color: string
) {
  const { workspace } = ctx;
  const trimmed = name.trim();
  if (!trimmed) throw new HttpError(400, "Label name is required");
  const [label] = await db
    .insert(labels)
    .values({ workspaceId: workspace.id, name: trimmed, color })
    .onConflictDoNothing()
    .returning();
  return label ?? null;
}

export async function updateLabel(
  ctx: WorkspaceContext,
  id: string,
  name: string,
  color: string
) {
  const { workspace } = ctx;
  await db
    .update(labels)
    .set({ name: name.trim(), color })
    .where(and(eq(labels.id, id), eq(labels.workspaceId, workspace.id)));
}

export async function deleteLabel(ctx: WorkspaceContext, id: string) {
  const { workspace } = ctx;
  await db
    .delete(labels)
    .where(and(eq(labels.id, id), eq(labels.workspaceId, workspace.id)));
}
