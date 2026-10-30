import {
  classifyContentType,
  maxBytesFor,
  type AttachmentInput,
} from "@reline/shared";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { fetchAttachmentUrl } from "@/lib/mcp/attachment-fetch";
import {
  cleanFilename,
  MAX_MCP_ATTACHMENTS_TOTAL_BYTES,
  sniffContentType,
  TOTAL_TOO_LARGE,
  UNSUPPORTED_FILE,
  type McpAttachmentSource,
  type McpReferencedUpload,
  type McpUpload,
} from "@/lib/mcp/attachment-input";
import { membershipForUser } from "@/lib/mcp/load-issue";
import type { McpToolResult } from "@/lib/mcp/types";
import { mcpUploadKey, mcpUploadPrefix, presignPut, readObjectStart } from "@/lib/r2";

/** Enough of a file to read its type. */
const SNIFF_BYTES = 512;

export async function createAttachmentUploadTool(
  userId: string,
  args: unknown
): Promise<McpToolResult> {
  const record = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  const errors: string[] = [];

  const filename = cleanFilename(record.filename);
  if (!filename) errors.push("Pass a filename, such as screenshot.png.");

  const contentType =
    typeof record.contentType === "string" ? record.contentType.trim().toLowerCase() : "";
  const media = classifyContentType(contentType);
  if (!media) {
    errors.push(`contentType ${UNSUPPORTED_FILE}`);
  }

  const size = record.size;
  if (typeof size !== "number" || !Number.isInteger(size) || size <= 0) {
    errors.push("Pass size as the exact file size in bytes.");
  } else if (media && size > maxBytesFor(media.kind)) {
    const limit = maxBytesFor(media.kind) / (1024 * 1024);
    errors.push(`${media.kind === "image" ? "Images" : "Videos"} must be under ${limit} MB.`);
  }

  const slug = typeof record.workspace === "string" ? record.workspace.trim() : undefined;
  const located = await membershipForUser(userId, slug || undefined);
  if (!located.ok) errors.push(located.error);

  if (errors.length || !filename || !media || !located.ok) {
    return { content: [{ type: "text", text: errors.join("\n") }], isError: true };
  }

  try {
    const key = mcpUploadKey(located.value.workspace.id, userId, media.ext);
    const uploadUrl = await presignPut(key, contentType, size as number);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              uploadUrl,
              method: "PUT",
              headers: { "Content-Type": contentType, "Content-Length": String(size) },
              expiresInSeconds: 600,
              attachment: { upload: key, filename },
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    console.error(error);
    return { content: [{ type: "text", text: "Could not create an upload link." }], isError: true };
  }
}

/**
 * Turn attachment sources into files ready to store, without storing anything,
 * so a call with any problem leaves no trace in the bucket.
 */
export async function prepareAttachments(
  userId: string,
  workspaceId: string,
  sources: McpAttachmentSource[] | undefined
): Promise<{ uploads: McpUpload[]; references: AttachmentInput[]; errors: string[] }> {
  const errors: string[] = [];
  const uploads: McpUpload[] = [];
  const references: AttachmentInput[] = [];
  if (!sources?.length) return { uploads, references, errors };

  const settled = await Promise.all(
    sources.map(async (source) => {
      if ("bytes" in source) return { ok: true as const, value: source };
      if ("url" in source) return fetchAttachmentUrl(source);
      return checkReference(userId, workspaceId, source);
    })
  );
  for (const result of settled) {
    if (!result.ok) errors.push(result.error);
    else if ("bytes" in result.value) uploads.push(result.value);
    else references.push(result.value);
  }

  const total = uploads.reduce((sum, upload) => sum + upload.bytes.length, 0);
  if (total > MAX_MCP_ATTACHMENTS_TOTAL_BYTES) errors.push(TOTAL_TOO_LARGE);

  if (references.length) {
    const keys = references.map((file) => file.key);
    const used = await db.query.attachments.findMany({
      where: inArray(attachments.key, keys),
      columns: { key: true },
    });
    const usedKeys = new Set(used.map((row) => row.key));
    for (const file of references) {
      if (usedKeys.has(file.key)) {
        errors.push(`${file.filename} is already attached. Create a new upload for another copy.`);
      }
    }
    if (new Set(keys).size !== keys.length) {
      errors.push("The same upload is listed more than once.");
    }
  }
  return { uploads, references, errors };
}

/** The client chose the bytes and the label, so confirm both before attaching. */
export async function checkReference(
  userId: string,
  workspaceId: string,
  source: McpReferencedUpload,
  read: typeof readObjectStart = readObjectStart
): Promise<{ ok: true; value: AttachmentInput } | { ok: false; error: string }> {
  const { filename, uploadKey } = source;
  const prefix = mcpUploadPrefix(workspaceId, userId);
  if (!uploadKey.startsWith(prefix) || uploadKey.includes("..")) {
    return {
      ok: false,
      error: `${filename} has an upload value that is not yours or is for a different workspace.`,
    };
  }

  let object: Awaited<ReturnType<typeof readObjectStart>>;
  try {
    object = await read(uploadKey, SNIFF_BYTES);
  } catch (error) {
    console.error(error);
    return { ok: false, error: `Could not read the upload for ${filename}.` };
  }
  if (!object) {
    return { ok: false, error: `${filename} has not been uploaded. PUT it to the upload URL first.` };
  }

  const contentType = sniffContentType(object.bytes);
  const media = contentType ? classifyContentType(contentType) : null;
  if (!contentType || !media) return { ok: false, error: `${filename} ${UNSUPPORTED_FILE}` };
  if (object.contentType?.toLowerCase() !== contentType) {
    return { ok: false, error: `${filename} is ${contentType}, not ${object.contentType}.` };
  }
  if (object.size > maxBytesFor(media.kind)) {
    const limit = maxBytesFor(media.kind) / (1024 * 1024);
    return { ok: false, error: `${filename} is too large. The limit is ${limit} MB.` };
  }
  return {
    ok: true,
    value: { key: uploadKey, filename, contentType, size: object.size },
  };
}
