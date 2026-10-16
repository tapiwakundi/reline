import { fetchJson, jsonBody } from "@/lib/fetch-json";
import { workspaceSlugFromPath } from "@/lib/workspace-slug";
import type { StatusType, WorkspaceStatus } from "@/lib/types";

function ws() {
  return { workspaceSlug: workspaceSlugFromPath() };
}

export async function listStatuses() {
  const { statuses } = await fetchJson<{ statuses: WorkspaceStatus[] }>(
    "/api/statuses",
    ws()
  );
  return statuses;
}

export async function createStatus(input: {
  name: string;
  type: StatusType;
  color: string;
}) {
  const { statuses } = await fetchJson<{ statuses: WorkspaceStatus[] }>(
    "/api/statuses",
    { ...jsonBody(input), ...ws() }
  );
  return statuses;
}

export async function updateStatus(
  id: string,
  patch: { name?: string; type?: StatusType; color?: string }
) {
  const { statuses } = await fetchJson<{ statuses: WorkspaceStatus[] }>(
    `/api/statuses/${id}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
      ...ws(),
    }
  );
  return statuses;
}

export async function reorderStatuses(ids: string[]) {
  const { statuses } = await fetchJson<{ statuses: WorkspaceStatus[] }>(
    "/api/statuses/order",
    { ...jsonBody({ ids }), ...ws() }
  );
  return statuses;
}

export async function deleteStatus(id: string, moveToId?: string) {
  const { statuses } = await fetchJson<{ statuses: WorkspaceStatus[] }>(
    `/api/statuses/${id}`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(moveToId ? { moveToId } : {}),
      ...ws(),
    }
  );
  return statuses;
}
