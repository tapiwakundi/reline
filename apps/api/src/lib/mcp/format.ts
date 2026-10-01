import type { McpAttachment, McpComment, McpIssue, McpPerson } from "@/lib/mcp/types";
import { EMBEDDABLE_IMAGE_TYPES } from "@/lib/mcp/types";

export function allAttachments(issue: McpIssue): McpAttachment[] {
  return [
    ...issue.attachments,
    ...issue.comments.flatMap((comment) => comment.attachments),
  ];
}

export function selectEmbedded(
  attachments: McpAttachment[],
  maxBytes: number,
  maxCount: number
): Set<string> {
  const ids = new Set<string>();
  for (const attachment of attachments) {
    if (ids.size >= maxCount) break;
    if (!canEmbed(attachment, maxBytes)) continue;
    ids.add(attachment.id);
  }
  return ids;
}

export function canEmbed(attachment: McpAttachment, maxBytes: number): boolean {
  return (
    attachment.kind === "image" &&
    Boolean(attachment.url) &&
    EMBEDDABLE_IMAGE_TYPES.has(attachment.contentType.toLowerCase()) &&
    attachment.size > 0 &&
    attachment.size <= maxBytes
  );
}

export function formatIssue(issue: McpIssue, embedded: Set<string>): string {
  const lines = [
    `${issue.identifier} · ${issue.title}`,
    issue.url ? `URL: ${issue.url}` : null,
    `Workspace: ${issue.workspaceName} (${issue.workspaceSlug})`,
    `Status: ${issue.statusName} (${issue.statusType})`,
    `Priority: ${issue.priorityLabel}`,
    `Type: ${issue.typeLabel}`,
    `Assignee: ${formatPerson(issue.assignee) ?? "Unassigned"}`,
    `Creator: ${formatPerson(issue.creator) ?? "Unknown"}`,
    `Cycle: ${
      issue.cycle
        ? `${issue.cycle.number} · ${issue.cycle.name} (${issue.cycle.status})`
        : "none"
    }`,
    `Labels: ${issue.labels.length ? issue.labels.join(", ") : "none"}`,
    `Estimate: ${issue.estimate ?? "unset"}`,
    `Created: ${issue.createdAt}`,
    `Updated: ${issue.updatedAt}`,
    "",
    "Description:",
    issue.description.trim() || "(empty)",
    "",
    "Attachments:",
    issue.attachments.length
      ? issue.attachments.map((attachment) => attachmentLine(attachment, embedded)).join("\n")
      : "none",
    "",
    "Comments:",
    formatComments(issue.comments, embedded),
  ];
  return lines.filter((line) => line !== null).join("\n");
}

export function formatAttachment(attachment: McpAttachment, embedded: boolean): string {
  return [
    `${attachment.filename}`,
    `Id: ${attachment.id}`,
    `Kind: ${attachment.kind}`,
    `Type: ${attachment.contentType}`,
    `Size: ${formatBytes(attachment.size)}`,
    `URL: ${attachment.url ?? "(file storage is not configured)"}`,
    embedded
      ? "The image bytes follow."
      : attachment.kind === "video"
        ? "Video bytes are not inlined. Open the URL to watch it."
        : "The file was not inlined. Open the URL.",
  ].join("\n");
}

function formatComments(comments: McpComment[], embedded: Set<string>): string {
  const byParent = new Map<string | null, McpComment[]>();
  const ids = new Set(comments.map((comment) => comment.id));
  for (const comment of comments) {
    const parent =
      comment.parentId && ids.has(comment.parentId) ? comment.parentId : null;
    const list = byParent.get(parent) ?? [];
    list.push(comment);
    byParent.set(parent, list);
  }

  const lines: string[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const comment of byParent.get(parent) ?? []) {
      const pad = "  ".repeat(depth);
      lines.push(
        `${pad}- ${formatPerson(comment.author) ?? "Unknown"} · ${comment.createdAt}`
      );
      const body = comment.body.trim() || "(no text)";
      for (const line of body.split("\n")) {
        lines.push(`${pad}  ${line}`);
      }
      if (comment.attachments.length) {
        lines.push(`${pad}  Attachments:`);
        for (const attachment of comment.attachments) {
          lines.push(`${pad}  ${attachmentLine(attachment, embedded)}`);
        }
      }
      walk(comment.id, depth + 1);
    }
  };
  walk(null, 0);
  return lines.length ? lines.join("\n") : "none";
}

function attachmentLine(attachment: McpAttachment, embedded: Set<string>): string {
  const url = attachment.url ?? "(file storage is not configured)";
  const note = embedded.has(attachment.id)
    ? " — image included below"
    : attachment.kind === "video"
      ? " — video, open the URL"
      : attachment.url
        ? " — open the URL"
        : "";
  return `- ${attachment.filename} (${attachment.kind}, ${formatBytes(attachment.size)}) id=${attachment.id} ${url}${note}`;
}

function formatPerson(person: McpPerson | null): string | null {
  if (!person) return null;
  return `${person.name} <${person.email}>`;
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
