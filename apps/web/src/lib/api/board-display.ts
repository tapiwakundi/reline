import { fetchJson, jsonBody } from "@/lib/fetch-json";
import { workspaceSlugFromPath } from "@/lib/workspace-slug";
import type { BoardDisplayPrefs } from "@/lib/board-display";

export async function updateBoardDisplayPrefs(
  prefs: BoardDisplayPrefs
): Promise<void> {
  await fetchJson<{ ok: true }>("/api/workspace/board-display", {
    ...jsonBody(prefs),
    workspaceSlug: workspaceSlugFromPath(),
  });
}
