import type { McpAttachment, McpContent } from "@/lib/mcp/types";
import { EMBEDDABLE_IMAGE_TYPES } from "@/lib/mcp/types";

export async function embedImages(
  attachments: McpAttachment[],
  fetchImpl: typeof fetch = fetch
): Promise<McpContent[]> {
  const blocks: McpContent[] = [];
  for (const attachment of attachments) {
    const image = await downloadImage(attachment, fetchImpl);
    if (!image) {
      blocks.push({
        type: "text",
        text: `Could not embed ${attachment.filename} (${attachment.id}). Open ${attachment.url ?? "the attachment URL"} instead.`,
      });
      continue;
    }
    blocks.push({
      type: "text",
      text: `Image ${attachment.filename} (${attachment.id})`,
    });
    blocks.push({ type: "image", data: image.data, mimeType: image.mimeType });
  }
  return blocks;
}

async function downloadImage(
  attachment: McpAttachment,
  fetchImpl: typeof fetch
): Promise<{ data: string; mimeType: string } | null> {
  if (!attachment.url || !isAllowedAttachmentUrl(attachment.url)) return null;
  const mimeType = attachment.contentType.toLowerCase();
  if (!EMBEDDABLE_IMAGE_TYPES.has(mimeType)) return null;

  let response: Response;
  try {
    response = await fetchImpl(attachment.url, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return null;
  }
  if (!response.ok || !response.body) return null;

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > attachment.size || total > 8 * 1024 * 1024) return null;
      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }

  const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
  if (!bytes.length) return null;
  return { data: bytes.toString("base64"), mimeType };
}

/** Only fetch objects we issued under the configured public attachment origin. */
export function isAllowedAttachmentUrl(url: string): boolean {
  const base = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  if (!base) return false;
  let target: URL;
  let allowed: URL;
  try {
    target = new URL(url);
    allowed = new URL(base);
  } catch {
    return false;
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") return false;
  if (target.origin !== allowed.origin) return false;
  if (target.username || target.password) return false;
  const prefix = allowed.pathname.replace(/\/$/, "");
  const path = target.pathname;
  if (prefix) return path.startsWith(`${prefix}/`) && !path.includes("..");
  return path.startsWith("/") && !path.includes("..");
}
