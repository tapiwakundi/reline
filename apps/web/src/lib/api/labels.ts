import { fetchJson, jsonBody } from "@/lib/fetch-json";
import { workspaceSlugFromPath } from "@/lib/workspace-slug";
import type { LabelRow } from "@/lib/types";

function ws() {
  return { workspaceSlug: workspaceSlugFromPath() };
}

export async function createLabel(name: string, color: string) {
  const { label } = await fetchJson<{ label: LabelRow | null }>(
    "/api/labels",
    { ...jsonBody({ name, color }), ...ws() }
  );
  return label;
}

export async function updateLabel(
  id: string,
  name: string,
  color: string
): Promise<void> {
  await fetchJson<{ ok: true }>(`/api/labels/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, color }),
    ...ws(),
  });
}

export async function deleteLabel(id: string): Promise<void> {
  await fetchJson<{ ok: true }>(`/api/labels/${id}`, {
    method: "DELETE",
    ...ws(),
  });
}
