import { Suspense } from "react";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/session";
import { getIssues } from "@/lib/queries";
import { db } from "@/db";
import { memberships } from "@/db/schema";
import {
  BOARD_DISPLAY_COOKIE,
  normalizeBoardDisplayPrefs,
} from "@/lib/board-display";
import { Board } from "@/components/board/board";

export default async function BoardPage() {
  const { workspace, membership } = await requireWorkspace();

  // Prefer DB prefs; one-time migrate from the old cookie if present.
  let prefs = normalizeBoardDisplayPrefs(membership.boardDisplay);
  if (membership.boardDisplay == null) {
    const fromCookie = (await cookies()).get(BOARD_DISPLAY_COOKIE)?.value;
    if (fromCookie) {
      prefs = normalizeBoardDisplayPrefs(fromCookie);
      await db
        .update(memberships)
        .set({ boardDisplay: prefs })
        .where(eq(memberships.id, membership.id));
    }
  }

  const issues = await getIssues(workspace.id, workspace.prefix, {
    completed: prefs.completed,
    showBacklog: prefs.showBacklog,
  });

  return (
    <Suspense>
      <Board issues={issues} prefs={prefs} />
    </Suspense>
  );
}
