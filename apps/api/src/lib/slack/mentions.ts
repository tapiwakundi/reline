import { mentionSpans, type Member } from "@reline/shared";

const SLACK_USER = /<@([UW][A-Z0-9]+)(?:\|[^>]+)?>/g;

export function appMentionsToSlack(
  body: string,
  members: Member[],
  slackIds: Map<string, string>
): string {
  const spans = mentionSpans(body, members);
  if (spans.length === 0) return body;

  let result = body;
  for (const span of [...spans].reverse()) {
    const slackId = slackIds.get(span.member.id);
    if (!slackId) continue;
    result = `${result.slice(0, span.start)}<@${slackId}>${result.slice(span.end)}`;
  }
  return result;
}

export function slackMentionsToApp(
  body: string,
  namesBySlackId: Map<string, string>
): string {
  return body.replace(SLACK_USER, (match, slackId: string) => {
    const name = namesBySlackId.get(slackId);
    return name ? `@${name}` : match;
  });
}

export function formatSlackIssueMessage(opts: {
  identifier: string;
  title: string;
  url: string;
  body: string;
}): string {
  const header = `*${opts.identifier}* ${opts.title}`.trim();
  const link = `<${opts.url}|Open in Reline>`;
  const body = opts.body.trim();
  return body ? `${header}\n${link}\n\n${body}` : `${header}\n${link}`;
}

/** First message in a new issue channel: key, title, description, then the link. */
export function formatSlackChannelOpenedMessage(opts: {
  identifier: string;
  title: string;
  url: string;
  description: string;
}): string {
  const header = `*${opts.identifier}* ${opts.title}`.trim();
  const link = `<${opts.url}|Open in Reline>`;
  const description = opts.description.trim();
  if (!description) return `${header}\n${link}`;
  return `${header}\n${description}\n\n${link}`;
}

export function relineCommentIdFromSlackMetadata(
  metadata:
    | { event_type?: string; event_payload?: { comment_id?: unknown } }
    | null
    | undefined
): string | null {
  if (!metadata || metadata.event_type !== "reline_comment") return null;
  const id = metadata.event_payload?.comment_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}
