import { createHmac, timingSafeEqual } from "node:crypto";
import { classifyContentType } from "@reline/shared";
import { sniffContentType, UNSUPPORTED_FILE } from "@/lib/mcp/attachment-input";
import { publicAppUrl } from "@/lib/public-url";
import { putObject } from "@/lib/r2";

/**
 * Upload links from create_attachment_upload point at the web host, the same
 * origin the MCP client already reaches, and the API forwards the bytes to R2.
 * A direct R2 link fails from sandboxes whose egress allowlist does not
 * include r2.cloudflarestorage.com.
 */

export const UPLOAD_LINK_TTL_MS = 10 * 60 * 1000;

/** Tells an upload link apart from other tokens signed with the same secret. */
const LINK_KIND = "mcp-upload";

export type UploadLink = {
  /** Object key the bytes go to; already scoped to the workspace and user. */
  key: string;
  contentType: string;
  size: number;
  filename: string;
  exp: number;
};

function signingSecret(): string {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value) throw new Error("BETTER_AUTH_SECRET is not set");
  return value;
}

function signature(body: string): string {
  return createHmac("sha256", signingSecret()).update(body).digest("base64url");
}

export function signUploadLink(input: Omit<UploadLink, "exp">, now = Date.now()): string {
  const payload = { kind: LINK_KIND, ...input, exp: now + UPLOAD_LINK_TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${signature(body)}`;
}

export function readUploadLink(token: string, now = Date.now()): UploadLink | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(signature(body));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  const { kind, key, contentType, size, filename, exp } = payload as Record<string, unknown>;
  if (
    kind !== LINK_KIND ||
    typeof key !== "string" ||
    !key ||
    typeof contentType !== "string" ||
    !classifyContentType(contentType) ||
    typeof size !== "number" ||
    !Number.isInteger(size) ||
    size <= 0 ||
    typeof filename !== "string" ||
    !filename ||
    typeof exp !== "number"
  ) {
    return null;
  }
  if (exp < now) return null;
  return { key, contentType, size, filename, exp };
}

export function uploadLinkUrl(token: string): string {
  return `${publicAppUrl()}/api/mcp/uploads/${token}`;
}

export type ReceiveUploadDeps = {
  now?: () => number;
  put?: typeof putObject;
};

/** Handle the PUT a client makes to an upload link: check, then store under the link's key. */
export async function receiveUpload(
  request: Request,
  token: string,
  deps: ReceiveUploadDeps = {}
): Promise<Response> {
  const now = deps.now ?? Date.now;
  const put = deps.put ?? putObject;

  const link = readUploadLink(token, now());
  if (!link) {
    return json(
      { error: "This upload link is invalid or has expired. Call create_attachment_upload again." },
      404
    );
  }
  const { key, contentType, size, filename } = link;

  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) !== size) {
    return json({ error: sizeMismatch(filename, Number(declared), size) }, 400);
  }

  const bytes = await readBody(request, size);
  if (!bytes) {
    return json(
      { error: `${filename} is larger than the ${size} bytes declared to create_attachment_upload.` },
      400
    );
  }
  if (bytes.length !== size) {
    return json({ error: sizeMismatch(filename, bytes.length, size) }, 400);
  }

  const sniffed = sniffContentType(bytes);
  if (!sniffed) return json({ error: `${filename} ${UNSUPPORTED_FILE}` }, 415);
  if (sniffed !== contentType) {
    return json({ error: `${filename} is ${sniffed}, not ${contentType}.` }, 415);
  }

  try {
    await put(key, bytes, contentType);
  } catch (error) {
    console.error(error);
    return json({ error: `Could not store ${filename}. Try the upload again.` }, 500);
  }
  return json({ attachment: { upload: key, filename } }, 200);
}

function sizeMismatch(filename: string, actual: number, declared: number): string {
  return `${filename} is ${actual} bytes, not the ${declared} declared to create_attachment_upload.`;
}

/** The whole body, or null once it passes `limit` bytes. */
async function readBody(request: Request, limit: number): Promise<Buffer | null> {
  if (!request.body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  const reader = request.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
