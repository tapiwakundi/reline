import { fetchJson, jsonBody } from "@/lib/fetch-json";
import { workspaceSlugFromPath } from "@/lib/workspace-slug";
import type { CycleIssueDisposition } from "@/lib/types";

function ws() {
  return { workspaceSlug: workspaceSlugFromPath() };
}

export type { CycleIssueDisposition };

export async function createCycle(input: {
  name?: string;
  startDate: string;
  endDate: string;
}): Promise<void> {
  await fetchJson<{ ok: true }>("/api/cycles", {
    ...jsonBody(input),
    ...ws(),
  });
}

export async function updateCycle(
  cycleId: string,
  input: { name: string }
): Promise<void> {
  await fetchJson<{ ok: true }>(`/api/cycles/${cycleId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    ...ws(),
  });
}

export async function startCycle(cycleId: string): Promise<void> {
  await fetchJson<{ ok: true }>(`/api/cycles/${cycleId}/start`, {
    method: "POST",
    ...ws(),
  });
}

export async function completeCycle(
  cycleId: string,
  options: {
    inProgress: CycleIssueDisposition;
    pending: CycleIssueDisposition;
    nextCycleId?: string | null;
  }
): Promise<void> {
  await fetchJson<{ ok: true }>(`/api/cycles/${cycleId}/complete`, {
    ...jsonBody(options),
    ...ws(),
  });
}

export async function deleteCycle(cycleId: string): Promise<void> {
  await fetchJson<{ ok: true }>(`/api/cycles/${cycleId}`, {
    method: "DELETE",
    ...ws(),
  });
}
