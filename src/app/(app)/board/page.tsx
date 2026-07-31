import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/session";
import { getIssues } from "@/lib/queries";
import { db } from "@/db";
import { cycles, memberships } from "@/db/schema";
import { currentCycleId } from "@/lib/cycle-status";
import {
  BOARD_DISPLAY_COOKIE,
  normalizeBoardDisplayPrefs,
} from "@/lib/board-display";
import { Board } from "@/components/board/board";

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string | string[] }>;
}) {
  const { workspace, membership } = await requireWorkspace();
  const params = await searchParams;

  // Default the board to the current cycle. `cycle=all` opts out.
  if (params.cycle === undefined) {
    const cycleRows = await db.query.cycles.findMany({
      where: eq(cycles.workspaceId, workspace.id),
      columns: {
        id: true,
        status: true,
        startDate: true,
        endDate: true,
      },
    });
    if (currentCycleId(cycleRows)) redirect("/board?cycle=current");
  }

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
