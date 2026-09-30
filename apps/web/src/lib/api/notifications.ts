import { fetchJson } from "@/lib/fetch-json";
import { workspaceSlugFromPath } from "@/lib/workspace-slug";

function ws() {
  return { workspaceSlug: workspaceSlugFromPath() };
}

export async function markNotificationRead(id: string): Promise<void> {
  await fetchJson<{ ok: true }>(`/api/notifications/${id}/read`, {
    method: "POST",
    ...ws(),
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  await fetchJson<{ ok: true }>("/api/notifications/read-all", {
    method: "POST",
    ...ws(),
  });
}
