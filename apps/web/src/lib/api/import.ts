import { fetchJson, jsonBody } from "@/lib/fetch-json";
import { workspaceSlugFromPath } from "@/lib/workspace-slug";
import type { ImportReport } from "@/lib/types";

function ws() {
  return { workspaceSlug: workspaceSlugFromPath() };
}

export type { ImportReport };

export async function importJiraCsv(formData: FormData): Promise<ImportReport> {
  return fetchJson<ImportReport>("/api/import/jira-csv", {
    method: "POST",
    body: formData,
    ...ws(),
  });
}

export async function importJiraApi(input: {
  siteUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
}): Promise<ImportReport> {
  return fetchJson<ImportReport>("/api/import/jira-api", {
    ...jsonBody(input),
    ...ws(),
  });
}
