import { fetchJson, jsonBody } from "@/lib/fetch-json";
import { workspaceSlugFromPath } from "@/lib/workspace-slug";

function ws() {
  return { workspaceSlug: workspaceSlugFromPath() };
}

export async function createWorkspace(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const prefix = String(formData.get("prefix") ?? "").trim();
  return fetchJson<{ slug: string }>("/api/workspaces", {
    ...jsonBody({ name, prefix }),
  });
}

export async function createInvite() {
  return fetchJson<{ token: string }>("/api/workspace/invites", {
    method: "POST",
    ...ws(),
  });
}

export async function acceptInvite(token: string) {
  return fetchJson<{ slug: string }>(
    `/api/invites/${encodeURIComponent(token)}/accept`,
    { method: "POST" }
  );
}

export async function removeWorkspaceMember(userId: string) {
  return fetchJson<{ slug: string | null }>(
    `/api/workspace/members/${encodeURIComponent(userId)}`,
    { method: "DELETE", ...ws() }
  );
}

export async function deleteWorkspace(confirmName: string) {
  return fetchJson<{ slug: string | null }>("/api/workspace", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmName }),
    ...ws(),
  });
}
