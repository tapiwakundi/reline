"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { labels } from "@/db/schema";
import { requireWorkspace } from "@/lib/session";

export async function createLabel(name: string, color: string) {
  const { workspace } = await requireWorkspace();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Label name is required");
  const [label] = await db
    .insert(labels)
    .values({ workspaceId: workspace.id, name: trimmed, color })
    .onConflictDoNothing()
    .returning();
  revalidatePath("/settings/labels");
  revalidatePath("/board");
  revalidatePath("/issues");
  return label ?? null;
}

export async function updateLabel(id: string, name: string, color: string) {
  const { workspace } = await requireWorkspace();
  await db
    .update(labels)
    .set({ name: name.trim(), color })
    .where(and(eq(labels.id, id), eq(labels.workspaceId, workspace.id)));
  revalidatePath("/settings/labels");
}

export async function deleteLabel(id: string) {
  const { workspace } = await requireWorkspace();
  await db
    .delete(labels)
    .where(and(eq(labels.id, id), eq(labels.workspaceId, workspace.id)));
  revalidatePath("/settings/labels");
}
