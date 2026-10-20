import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { issues, slackInstallations, workspaces } from "@/db/schema";
import { splitIssueKey } from "@/lib/mcp/parse-link";
import { slackLinkPreviewCopy } from "@/lib/slack/link-preview";
import { installationCanUnfurl } from "@/lib/slack/scopes";

export async function loadSlackLinkPreview(
  slug: string,
  key: string
): Promise<{ title: string; description: string } | null> {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.slug, slug.trim().toLowerCase()),
    columns: { id: true, prefix: true },
  });
  if (!workspace) return null;

  const installation = await db.query.slackInstallations.findFirst({
    where: eq(slackInstallations.workspaceId, workspace.id),
    columns: { botScopes: true },
  });
  if (!installationCanUnfurl(installation?.botScopes)) return null;

  const parsed = splitIssueKey(key);
  if (!parsed || parsed.prefix.toLowerCase() !== workspace.prefix.toLowerCase()) {
    return null;
  }

  const issue = await db.query.issues.findFirst({
    where: and(eq(issues.workspaceId, workspace.id), eq(issues.number, parsed.number)),
    with: { status: true, assignee: true },
  });
  if (!issue) return null;

  return slackLinkPreviewCopy({
    identifier: `${workspace.prefix}-${issue.number}`,
    title: issue.title,
    statusName: issue.status?.name ?? "Unknown",
    priority: issue.priority,
    type: issue.type,
    assigneeName: issue.assignee?.name ?? null,
    description: issue.description,
  });
}
