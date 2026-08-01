"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requireSession, requireWorkspace } from "@/lib/session";
import { wsPath } from "@/lib/workspace-slug";

export async function markNotificationRead(id: string) {
  const session = await requireSession();
  const { workspace } = await requireWorkspace();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(notifications.id, id), eq(notifications.userId, session.user.id))
    );
  revalidatePath(wsPath(workspace.slug, "/inbox"));
}

export async function markAllNotificationsRead() {
  const session = await requireSession();
  const { workspace } = await requireWorkspace();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, session.user.id),
        isNull(notifications.readAt)
      )
    );
  revalidatePath(wsPath(workspace.slug, "/inbox"));
}
