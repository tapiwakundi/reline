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

export type SlackUnfurlContent = {
  color: string;
  fallback: string;
  blocks: [{ type: "section"; text: { type: "mrkdwn"; text: string } }];
  preview: { title: { type: "plain_text"; text: string; emoji: false } };
};

export type UnfurlCall = {
  channel?: string;
  ts?: string;
  unfurlId?: string;
  source?: string;
};

const DEFAULT_COLOR = "#5e6ad2";

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

export function ticketUnfurlContent(ticket: {
  identifier: string;
  title: string;
  url: string;
  statusName: string;
  statusColor: string | null;
  priorityLabel: string;
  typeLabel: string;
  assigneeName: string | null;
  description: string;
}): SlackUnfurlContent {
  const title = clamp(oneLine(ticket.title) || "Untitled", 180);
  const identifier = oneLine(ticket.identifier);
  const label = `${identifier} ${title}`.trim();
  const meta = [
    oneLine(ticket.typeLabel),
    oneLine(ticket.statusName) || "Unknown",
    oneLine(ticket.priorityLabel),
    oneLine(ticket.assigneeName) || "Unassigned",
  ]
    .filter(Boolean)
    .join(" · ");
  const excerpt = descriptionExcerpt(ticket.description);
  const lines = [`*${slackLink(ticket.url, label)}*`, slackPlain(meta)];
  if (excerpt) lines.push(slackPlain(excerpt));
  return {
    color: attachmentColor(ticket.statusColor),
    fallback: clamp(label, 300),
    blocks: [{ type: "section", text: { type: "mrkdwn", text: lines.join("\n") } }],
    preview: {
      title: { type: "plain_text", text: clamp(label, 150), emoji: false },
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

  const resolved: { url: string; token: string; content: SlackUnfurlContent }[] = [];
  for (const [workspaceId, items] of byWorkspace) {
    const issues = await opts.loadIssues(workspaceId, [
      ...new Set(items.map((item) => item.number)),
    ]);
    const byNumber = new Map(issues.map((issue) => [issue.number, issue]));
    for (const item of items) {
      const issue = byNumber.get(item.number);
      if (!issue) continue;
      resolved.push({
        url: item.url,
        token: item.token,
        content: ticketUnfurlContent({
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

  const byToken = new Map<string, Record<string, SlackUnfurlContent>>();
  for (const item of resolved) {
    const unfurls = byToken.get(item.token) ?? {};
    unfurls[item.url] = item.content;
    byToken.set(item.token, unfurls);
  }

  for (const [token, unfurls] of byToken) {
    try {
      await opts.client.unfurl(token, { ...target, unfurls });
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

function attachmentColor(color: string | null): string {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_COLOR;
}

function oneLine(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/** User-controlled text safe to place in Slack mrkdwn. */
function slackPlain(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slackLink(url: string, label: string): string {
  const safeLabel = slackPlain(label).replace(/\|/g, "·") || "Open ticket";
  if (/[|\s<>]/.test(url)) return safeLabel;
  return `<${url}|${safeLabel}>`;
}
