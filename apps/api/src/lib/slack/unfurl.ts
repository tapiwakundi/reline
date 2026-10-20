import { ISSUE_TYPES, PRIORITIES } from "@reline/shared";
import { SlackApiError, type SlackClient } from "@/lib/slack/client";
import { parseIssueRef, splitIssueKey } from "@/lib/mcp/parse-link";
import { installationCanUnfurl } from "@/lib/slack/scopes";

export type UnfurlInstallation = {
  workspaceId: string;
  workspaceSlug: string;
  prefix: string;
  botScopes: string | null;
  token: string;
};

export type UnfurlIssue = {
  number: number;
  title: string;
  description: string;
  priority: number;
  type: string;
  statusName: string;
  statusColor: string | null;
  assigneeName: string | null;
};

export type LinkSharedEvent = {
  type?: string;
  channel?: string;
  channel_id?: string;
  message_ts?: string;
  unfurl_id?: string;
  source?: string;
  links?: { domain?: string; url?: string }[];
};

export type WorkObjectEntity = {
  app_unfurl_url: string;
  url: string;
  external_ref: { id: string; type: "issue" };
  entity_type: "slack#/entities/task";
  entity_payload: {
    attributes: {
      title: { text: string };
      display_id: string;
      display_type: string;
      product_name: "Reline";
    };
    fields: {
      description?: { value: string };
      assignee?: { type: "slack#/types/user"; user: { text: string } };
      status: { value: string; tag_color: TagColor };
      priority: { value: string };
    };
    custom_fields: [{ key: "type"; label: "Type"; value: string; type: "string" }];
    display_order: string[];
  };
};

type TagColor = "red" | "yellow" | "green" | "gray" | "blue";

export type UnfurlCall = {
  channel?: string;
  ts?: string;
  unfurlId?: string;
  source?: string;
};

export function issueLinksOnOrigin(
  links: { url?: string }[],
  appOrigin: string
): { url: string; slug: string; identifier: string }[] {
  let originHost: string;
  try {
    originHost = new URL(appOrigin).host.toLowerCase();
  } catch {
    return [];
  }

  const seen = new Set<string>();
  const matched: { url: string; slug: string; identifier: string }[] = [];
  for (const link of links) {
    const url = link.url;
    if (!url || seen.has(url)) continue;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    if (parsed.host.toLowerCase() !== originHost) continue;
    const ref = parseIssueRef(url);
    if (!ref?.slug || !ref.identifier) continue;
    seen.add(url);
    matched.push({ url, slug: ref.slug, identifier: ref.identifier });
  }
  return matched;
}

export function installationForLink<T extends UnfurlInstallation>(
  installations: T[],
  link: { slug: string; identifier: string }
): T | null {
  const key = splitIssueKey(link.identifier);
  if (!key) return null;
  return (
    installations.find(
      (item) =>
        item.workspaceSlug.toLowerCase() === link.slug.toLowerCase() &&
        item.prefix.toLowerCase() === key.prefix.toLowerCase() &&
        installationCanUnfurl(item.botScopes)
    ) ?? null
  );
}

export function unfurlCallArgs(event: LinkSharedEvent): UnfurlCall | null {
  const composer =
    event.source === "composer" ||
    event.channel === "COMPOSER" ||
    event.channel_id === "COMPOSER";
  const source = event.source?.trim() || undefined;
  const unfurlId = event.unfurl_id?.trim() || undefined;
  const idPair = Boolean(unfurlId && source);
  if (composer) return idPair ? { unfurlId, source } : null;

  const channel = event.channel?.trim() || event.channel_id?.trim() || undefined;
  const ts = event.message_ts?.trim() || undefined;
  const channelPair = Boolean(channel && ts);
  if (!channelPair && !idPair) return null;
  return {
    ...(channelPair ? { channel, ts } : {}),
    ...(idPair ? { unfurlId, source } : {}),
  };
}

export function descriptionExcerpt(text: string, max = 240): string {
  const plain = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#>*_~|[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "";
  if (plain.length <= max) return plain;
  return `${plain.slice(0, max - 1).trimEnd()}…`;
}

/** Native Slack Work Object, the same card style Jira uses for an issue. */
export function ticketWorkObject(ticket: {
  identifier: string;
  title: string;
  url: string;
  statusName: string;
  statusColor: string | null;
  priorityLabel: string;
  typeLabel: string;
  assigneeName: string | null;
  description: string;
}): WorkObjectEntity {
  const identifier = oneLine(ticket.identifier) || "Issue";
  const title = clamp(oneLine(ticket.title) || "Untitled", 150);
  const typeLabel = oneLine(ticket.typeLabel) || "Issue";
  const assignee = oneLine(ticket.assigneeName);
  const excerpt = descriptionExcerpt(ticket.description, 500);
  const fields: WorkObjectEntity["entity_payload"]["fields"] = {
    status: {
      value: clamp(oneLine(ticket.statusName) || "Unknown", 80),
      tag_color: statusTagColor(ticket.statusColor),
    },
    priority: { value: clamp(oneLine(ticket.priorityLabel) || "No priority", 40) },
  };
  if (assignee) {
    fields.assignee = { type: "slack#/types/user", user: { text: clamp(assignee, 80) } };
  }
  if (excerpt) fields.description = { value: excerpt };
  const displayOrder = ["status", "priority", "type"];
  if (assignee) displayOrder.push("assignee");
  if (excerpt) displayOrder.push("description");
  return {
    app_unfurl_url: ticket.url,
    url: ticket.url,
    external_ref: { id: identifier, type: "issue" },
    entity_type: "slack#/entities/task",
    entity_payload: {
      attributes: {
        title: { text: title },
        display_id: clamp(identifier, 40),
        display_type: clamp(typeLabel, 40),
        product_name: "Reline",
      },
      fields,
      custom_fields: [{ key: "type", label: "Type", value: clamp(typeLabel, 40), type: "string" }],
      display_order: displayOrder,
    },
  };
}

export async function unfurlSharedIssueLinks(opts: {
  appOrigin: string;
  installations: UnfurlInstallation[];
  event: LinkSharedEvent;
  loadIssues: (workspaceId: string, numbers: number[]) => Promise<UnfurlIssue[]>;
  client: Pick<SlackClient, "unfurl">;
}): Promise<void> {
  const links = issueLinksOnOrigin(opts.event.links ?? [], opts.appOrigin);
  const target = unfurlCallArgs(opts.event);
  if (links.length === 0 || !target) return;

  const pending: {
    url: string;
    token: string;
    workspaceId: string;
    number: number;
    identifier: string;
  }[] = [];
  for (const link of links) {
    const install = installationForLink(opts.installations, link);
    if (!install) continue;
    const key = splitIssueKey(link.identifier);
    if (!key) continue;
    pending.push({
      url: link.url,
      token: install.token,
      workspaceId: install.workspaceId,
      number: key.number,
      identifier: `${install.prefix}-${key.number}`,
    });
  }
  if (pending.length === 0) return;

  const byWorkspace = new Map<string, typeof pending>();
  for (const item of pending) {
    const list = byWorkspace.get(item.workspaceId) ?? [];
    list.push(item);
    byWorkspace.set(item.workspaceId, list);
  }

  const resolved: { token: string; entity: WorkObjectEntity }[] = [];
  for (const [workspaceId, items] of byWorkspace) {
    const issues = await opts.loadIssues(workspaceId, [
      ...new Set(items.map((item) => item.number)),
    ]);
    const byNumber = new Map(issues.map((issue) => [issue.number, issue]));
    for (const item of items) {
      const issue = byNumber.get(item.number);
      if (!issue) continue;
      resolved.push({
        token: item.token,
        entity: ticketWorkObject({
          identifier: item.identifier,
          title: issue.title,
          url: item.url,
          statusName: issue.statusName,
          statusColor: issue.statusColor,
          priorityLabel: priorityLabel(issue.priority),
          typeLabel: typeLabel(issue.type),
          assigneeName: issue.assigneeName,
          description: issue.description,
        }),
      });
    }
  }
  if (resolved.length === 0) return;

  const byToken = new Map<string, WorkObjectEntity[]>();
  for (const item of resolved) {
    const entities = byToken.get(item.token) ?? [];
    entities.push(item.entity);
    byToken.set(item.token, entities);
  }

  for (const [token, entities] of byToken) {
    try {
      await opts.client.unfurl(token, { ...target, metadata: { entities } });
    } catch (error) {
      if (
        error instanceof SlackApiError &&
        (error.slackError === "missing_scope" || error.slackError === "cannot_unfurl_url")
      ) {
        console.error(`[slack] unfurl ${error.slackError}`);
        continue;
      }
      throw error;
    }
  }
}

function priorityLabel(value: number): string {
  return PRIORITIES.find((item) => item.value === value)?.label ?? "No priority";
}

function typeLabel(value: string): string {
  return ISSUE_TYPES.find((item) => item.value === value)?.label ?? value;
}

function statusTagColor(color: string | null): TagColor {
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) return "gray";
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  if (green >= red + 25 && green >= blue) return "green";
  if (red >= green + 25 && red >= blue + 25) return "red";
  if (red > 160 && green > 120 && blue < 100) return "yellow";
  if (blue >= red && blue >= green) return "blue";
  return "gray";
}

function oneLine(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

