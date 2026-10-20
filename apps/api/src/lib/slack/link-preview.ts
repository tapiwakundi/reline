import { timingSafeEqual } from "node:crypto";
import { ISSUE_TYPES, PRIORITIES } from "@reline/shared";
import { descriptionExcerpt } from "@/lib/slack/unfurl";

/** Sent by the web server when Slackbot asks for a ticket page. */
export const SLACK_LINK_PREVIEW_HEADER = "x-reline-internal-key";

export function isSlackLinkExpandingAgent(userAgent: string | null | undefined): boolean {
  return (userAgent ?? "").includes("Slackbot-LinkExpanding");
}

export function internalPreviewAuthorized(
  header: string | null | undefined,
  secret: string | undefined
): boolean {
  if (!secret || !header) return false;
  const provided = Buffer.from(header);
  const expected = Buffer.from(secret);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

/** Title and description Slack's crawler can read without a login page. */
export function slackLinkPreviewCopy(ticket: {
  identifier: string;
  title: string;
  statusName: string;
  priority: number;
  type: string;
  assigneeName: string | null;
  description: string;
}): { title: string; description: string } {
  const title = clamp(
    `${oneLine(ticket.identifier)} ${oneLine(ticket.title) || "Untitled"}`.trim(),
    180
  );
  const meta = [
    typeLabel(ticket.type),
    oneLine(ticket.statusName) || "Unknown",
    priorityLabel(ticket.priority),
    oneLine(ticket.assigneeName) || "Unassigned",
  ].join(" · ");
  const excerpt = descriptionExcerpt(ticket.description);
  return {
    title,
    description: clamp(excerpt ? `${meta} — ${excerpt}` : meta, 300),
  };
}

function priorityLabel(value: number): string {
  return PRIORITIES.find((item) => item.value === value)?.label ?? "No priority";
}

function typeLabel(value: string): string {
  return ISSUE_TYPES.find((item) => item.value === value)?.label ?? value;
}

function oneLine(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
