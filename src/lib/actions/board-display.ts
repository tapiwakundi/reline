"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { memberships } from "@/db/schema";
import { requireWorkspace } from "@/lib/session";
import type { BoardDisplayPrefs } from "@/lib/board-display";

export async function updateBoardDisplayPrefs(prefs: BoardDisplayPrefs) {
  const { membership } = await requireWorkspace();
  await db
    .update(memberships)
    .set({ boardDisplay: prefs })
    .where(eq(memberships.id, membership.id));
  revalidatePath("/board");
}
