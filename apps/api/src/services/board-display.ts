import { eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships } from "@/db/schema";
import type { BoardDisplayPrefs } from "@reline/shared";
import type { WorkspaceContext } from "@/lib/context";

export async function updateBoardDisplayPrefs(
  ctx: WorkspaceContext,
  prefs: BoardDisplayPrefs
) {
  const { membership } = ctx;
  await db
    .update(memberships)
    .set({ boardDisplay: prefs })
    .where(eq(memberships.id, membership.id));
}
