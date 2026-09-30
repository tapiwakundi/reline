import {
  allAttachments,
  canEmbed,
  formatAttachment,
  formatIssue,
  selectEmbedded,
} from "@/lib/mcp/format";
import { embedImages } from "@/lib/mcp/images";
import { loadAttachmentForUser, loadIssueForUser } from "@/lib/mcp/load-issue";
import { parseIssueRef } from "@/lib/mcp/parse-link";
import {
  MAX_ATTACHMENT_IMAGE_BYTES,
  MAX_EMBEDDED_IMAGES,
  MAX_ISSUE_IMAGE_BYTES,
  type McpToolResult,
} from "@/lib/mcp/types";

export async function getIssueTool(
  userId: string,
  args: unknown
): Promise<McpToolResult> {
  const url = readString(args, "url");
  const identifier = readString(args, "identifier");
  const workspace = readString(args, "workspace");
  if (!url && !identifier) {
    return toolError("Pass a Reline issue URL or an identifier like REL-42.");
  }

  const ref = url ? parseIssueRef(url) : parseIssueRef(identifier ?? "");
  if (!ref) {
    return toolError(
      url
        ? "That URL is not a Reline issue link. Expected a path like /acme/issue/REL-42."
        : "Identifier should look like REL-42."
    );
  }
  if (!url && workspace) ref.slug = workspace;

  try {
    const loaded = await loadIssueForUser(userId, ref);
    if (!loaded.ok) return toolError(loaded.error);

    const attachments = allAttachments(loaded.value);
    const embedded = selectEmbedded(
      attachments,
      MAX_ISSUE_IMAGE_BYTES,
      MAX_EMBEDDED_IMAGES
    );
    const images = await embedImages(
      attachments.filter((attachment) => embedded.has(attachment.id))
    );
    return {
      content: [{ type: "text", text: formatIssue(loaded.value, embedded) }, ...images],
    };
  } catch (error) {
    console.error(error);
    return toolError("Could not load that issue.");
  }
}

export async function getAttachmentTool(
  userId: string,
  args: unknown
): Promise<McpToolResult> {
  const id = readString(args, "id");
  if (!id) return toolError("Pass the attachment id from get_issue.");

  try {
    const loaded = await loadAttachmentForUser(userId, id);
    if (!loaded.ok) return toolError(loaded.error);

    const embedded = canEmbed(loaded.value, MAX_ATTACHMENT_IMAGE_BYTES);
    const images = embedded ? await embedImages([loaded.value]) : [];
    return {
      content: [
        { type: "text", text: formatAttachment(loaded.value, embedded && images.some((block) => block.type === "image")) },
        ...images,
      ],
    };
  } catch (error) {
    console.error(error);
    return toolError("Could not load that attachment.");
  }
}

export async function callReadOnlyTool(
  userId: string,
  name: string,
  args: unknown
): Promise<McpToolResult> {
  if (name === "get_issue") return getIssueTool(userId, args);
  if (name === "get_attachment") return getAttachmentTool(userId, args);
  return toolError("Unknown tool. This server only provides read-only issue lookup.");
}

function readString(args: unknown, key: string): string | undefined {
  if (!args || typeof args !== "object" || Array.isArray(args)) return undefined;
  const value = (args as Record<string, unknown>)[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function toolError(text: string): McpToolResult {
  return { content: [{ type: "text", text }], isError: true };
}
