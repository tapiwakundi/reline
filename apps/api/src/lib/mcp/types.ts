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
  epic: { identifier: string; title: string } | null;
  children: { identifier: string; title: string; statusName: string }[];
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
export const MCP_SERVER_VERSION = "0.2.0";

export const MCP_READ_SCOPE = "read";
export const MCP_WRITE_SCOPE = "write";
export type McpScope = typeof MCP_READ_SCOPE | typeof MCP_WRITE_SCOPE;

export const MCP_READ_ONLY_TOKEN_MESSAGE =
  "This token is read-only. Revoke it and create a new token in Settings → Claude to create and edit issues.";

export const MCP_READ_INSTRUCTIONS =
  "Reline gives this token read-only access to issues. When the user shares a ticket link or an issue key (for example https://example.com/acme/issue/REL-42 or REL-42), call get_issue before answering. The result includes the title, description, status, comments, and attachments. Image attachments are embedded so you can see them. This token cannot create or edit issues. A token created in Settings → Claude can create and edit; existing read-only tokens stay read-only until they are revoked and created again.";

export const MCP_WRITE_INSTRUCTIONS =
  "Reline can read, create, and edit issues in workspaces this user belongs to. When the user shares a ticket link or an issue key (for example https://example.com/acme/issue/REL-42 or REL-42), call get_issue before answering. Call create_issue to create a ticket and update_issue to change one, including epics. Set type to epic to create or convert an epic. Set epic to an issue key, URL, or epic title to attach a ticket to an epic, or none to remove it. On an epic, pass issues as keys or URLs to attach those tickets; tickets already in the epic stay. An epic cannot belong to another epic. Pass attachments to create_issue or update_issue to add screenshots or videos. Use url for a hosted file. For a local file, call create_attachment_upload, PUT the file to the link, and pass the attachment it returns. Use base64 data only when neither is possible. Set cycle to active for the current cycle. Assignee accepts a first name when only one member matches. Validation errors list every problem at once, so fix them all before retrying. Descriptions are markdown and render with the issue editor: # / ## / ### headings, - bullets, 1. numbered lists, - [ ] and - [x] checkboxes, > quotes, fenced code blocks, --- dividers, and inline **bold**, *italic*, ~~strikethrough~~, `code`, and links. Mention teammates as @Name. Put each block on its own line. This server cannot delete issues.";

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
