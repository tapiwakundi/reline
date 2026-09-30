export type McpPerson = {
  name: string;
  email: string;
};

export type McpAttachment = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  kind: "image" | "video";
  url: string | null;
};

export type McpComment = {
  id: string;
  parentId: string | null;
  body: string;
  createdAt: string;
  author: McpPerson | null;
  attachments: McpAttachment[];
};

export type McpIssue = {
  identifier: string;
  title: string;
  description: string;
  url: string | null;
  workspaceName: string;
  workspaceSlug: string;
  statusName: string;
  statusType: string;
  priorityLabel: string;
  typeLabel: string;
  assignee: McpPerson | null;
  creator: McpPerson | null;
  cycle: { number: number; name: string; status: string } | null;
  labels: string[];
  estimate: number | null;
  createdAt: string;
  updatedAt: string;
  attachments: McpAttachment[];
  comments: McpComment[];
};

export type McpContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

export type McpToolResult = {
  content: McpContent[];
  isError?: boolean;
};

export const MCP_SERVER_NAME = "reline";
export const MCP_SERVER_VERSION = "0.1.0";

export const MCP_INSTRUCTIONS =
  "Reline gives read-only access to issues. When the user shares a ticket link or an issue key (for example https://example.com/acme/issue/REL-42 or REL-42), call get_issue before answering. The result includes the title, description, status, comments, and attachments. Image attachments are embedded so you can see them. This server cannot create, edit, or delete issues.";

/** Images included inline with an issue. Larger files stay as URLs. */
export const MAX_ISSUE_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_EMBEDDED_IMAGES = 8;
/** A single attachment requested explicitly can be a bit larger. */
export const MAX_ATTACHMENT_IMAGE_BYTES = 8 * 1024 * 1024;

export const EMBEDDABLE_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
]);
