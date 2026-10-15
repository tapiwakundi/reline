import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { issues, slackInstallations } from "@/db/schema";
import { liveSlackClient, type SlackClient } from "@/lib/slack/client";
import { publicAppUrl } from "@/lib/slack/config";
import { decryptSecret } from "@/lib/slack/crypto";
import {
  unfurlSharedIssueLinks,
  type LinkSharedEvent,
  type UnfurlInstallation,
  type UnfurlIssue,
} from "@/lib/slack/unfurl";

export async function handleSlackLinkShared(
  payload: { team_id?: string; event?: LinkSharedEvent },
  client: SlackClient = liveSlackClient
): Promise<void> {
  const event = payload.event;
  if (!event || event.type !== "link_shared" || !payload.team_id) return;
  const installations = await loadInstallations(payload.team_id);
  if (installations.length === 0) return;
  await unfurlSharedIssueLinks({
    appOrigin: publicAppUrl(),
    installations,
    event,
    client,
    loadIssues: loadIssuesForUnfurl,
  });
}

async function loadInstallations(teamId: string): Promise<UnfurlInstallation[]> {
  const rows = await db.query.slackInstallations.findMany({
    where: eq(slackInstallations.teamId, teamId),
    with: { workspace: true },
  });
  const installations: UnfurlInstallation[] = [];
  for (const row of rows) {
    if (!row.workspace) continue;
    let token: string;
    try {
      token = decryptSecret(row.botTokenEncrypted);
    } catch (error) {
      console.error("[slack] unfurl token", error);
      continue;
    }
    installations.push({
      workspaceId: row.workspace.id,
      workspaceSlug: row.workspace.slug,
      prefix: row.workspace.prefix,
      botScopes: row.botScopes,
      token,
    });
  }
  return installations;
}

async function loadIssuesForUnfurl(
  workspaceId: string,
  numbers: number[]
): Promise<UnfurlIssue[]> {
  if (numbers.length === 0) return [];
  const rows = await db.query.issues.findMany({
    where: and(eq(issues.workspaceId, workspaceId), inArray(issues.number, numbers)),
    with: { status: true, assignee: true },
  });
  return rows.map((row) => ({
    number: row.number,
    title: row.title,
    description: row.description,
    priority: row.priority,
    type: row.type,
    statusName: row.status?.name ?? "Unknown",
    statusColor: row.status?.color ?? null,
    assigneeName: row.assignee?.name ?? null,
  }));
}
