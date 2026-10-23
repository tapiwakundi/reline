import { classifyContentType, MAX_ATTACHMENTS } from "@reline/shared";

/** Decoded size limit for one file sent inline through MCP. */
export const MAX_MCP_ATTACHMENT_BYTES = 10 * 1024 * 1024;
/** Decoded size limit for all files in one MCP call. */
export const MAX_MCP_ATTACHMENTS_TOTAL_BYTES = 12 * 1024 * 1024;

const FILENAME_MAX = 200;

export type McpUpload = {
  filename: string;
  contentType: string;
  kind: "image" | "video";
  ext: string;
  bytes: Buffer;
};

type UploadResult =
  | { ok: true; value: McpUpload[] }
  | { ok: false; error: string };

/**
 * Parse the `attachments` tool argument: a list of
 * `{ filename, data }` where data is base64 (a data: URL works too). The file type
 * comes from the bytes themselves.
 */
export function parseAttachmentUploads(value: unknown): UploadResult {
  if (!Array.isArray(value)) {
    return { ok: false, error: "Attachments must be a list of { filename, data } objects." };
  }
  if (value.length > MAX_ATTACHMENTS) {
    return { ok: false, error: `Attach at most ${MAX_ATTACHMENTS} files at a time.` };
  }

  const uploads: McpUpload[] = [];
  let total = 0;
  for (const [index, item] of value.entries()) {
    const label = `Attachment ${index + 1}`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: `${label} must be an object with filename and data.` };
    }
    const record = item as Record<string, unknown>;

    const filename = cleanFilename(record.filename);
    if (!filename) return { ok: false, error: `${label} needs a filename, such as screenshot.png.` };

    if (typeof record.data !== "string" || !record.data.trim()) {
      return { ok: false, error: `${filename} needs base64 data.` };
    }
    const bytes = decodeData(record.data);
    if (!bytes) return { ok: false, error: `${filename} data is not valid base64.` };
    if (!bytes.length) return { ok: false, error: `${filename} is empty.` };

    // Trust the bytes, not the label, so nothing else lands in the bucket as an image.
    const contentType = sniffContentType(bytes);
    const media = contentType ? classifyContentType(contentType) : null;
    if (!contentType || !media) {
      return {
        ok: false,
        error: `${filename} is not a supported file. Only images (jpeg, png, gif, webp, avif) and videos (mp4, webm, mov) can be attached.`,
      };
    }

    if (bytes.length > MAX_MCP_ATTACHMENT_BYTES) {
      return {
        ok: false,
        error: `${filename} is too large. Files sent through MCP must be under ${MAX_MCP_ATTACHMENT_BYTES / (1024 * 1024)} MB.`,
      };
    }
    total += bytes.length;
    if (total > MAX_MCP_ATTACHMENTS_TOTAL_BYTES) {
      return {
        ok: false,
        error: `Attachments are too large together. Keep one call under ${MAX_MCP_ATTACHMENTS_TOTAL_BYTES / (1024 * 1024)} MB.`,
      };
    }

    uploads.push({ filename, contentType, kind: media.kind, ext: media.ext, bytes });
  }
  return { ok: true, value: uploads };
}

function cleanFilename(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const base = value.split(/[\\/]/).pop() ?? "";
  const name = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!name) return null;
  return name.slice(0, FILENAME_MAX);
}

function decodeData(value: string): Buffer | null {
  let data = value.trim();
  const dataUrl = /^data:[^,]*,/i.exec(data);
  if (dataUrl) {
    if (!/;base64,$/i.test(dataUrl[0])) return null;
    data = data.slice(dataUrl[0].length);
  }
  data = data.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data) || data.length % 4 === 1) return null;
  return Buffer.from(data, "base64");
}

/** Content type from the file's leading bytes, when it is one we accept. */
export function sniffContentType(bytes: Buffer): string | undefined {
  const starts = (sig: number[], offset = 0) =>
    bytes.length >= offset + sig.length && sig.every((b, i) => bytes[offset + i] === b);
  const ascii = (start: number, end: number) => bytes.subarray(start, end).toString("latin1");

  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a") return "image/gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (starts([0x1a, 0x45, 0xdf, 0xa3])) return "video/webm";
  if (ascii(4, 8) === "ftyp") return sniffIsoMedia(bytes);
  return undefined;
}

/** mp4, mov, and avif share the ISO box format; the ftyp brands tell them apart. */
function sniffIsoMedia(bytes: Buffer): string | undefined {
  const boxSize = Math.min(bytes.readUInt32BE(0), bytes.length, 256);
  const brands = [bytes.subarray(8, 12).toString("latin1")];
  for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
    brands.push(bytes.subarray(offset, offset + 4).toString("latin1"));
  }
  if (brands.includes("avif") || brands.includes("avis")) return "image/avif";
  // HEIC and other still-image brands are not supported.
  if (brands[0] === "mif1" || brands[0] === "msf1" || brands[0].startsWith("hei") || brands[0].startsWith("hev")) {
    return undefined;
  }
  if (brands[0] === "qt  ") return "video/quicktime";
  return "video/mp4";
}
