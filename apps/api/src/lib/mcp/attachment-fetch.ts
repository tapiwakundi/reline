import { lookup as dnsLookup } from "node:dns";
import { request } from "node:https";
import type { IncomingMessage } from "node:http";
import { BlockList, isIP } from "node:net";
import {
  cleanFilename,
  MAX_MCP_ATTACHMENT_BYTES,
  uploadFromBytes,
  type McpUpload,
  type McpUrlAttachment,
} from "@/lib/mcp/attachment-input";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

const BLOCKED = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  BLOCKED.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  BLOCKED.addSubnet(network, prefix, "ipv6");
}

/** Addresses a URL from a tool call must never reach, such as cloud metadata or our own network. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return BLOCKED.check(address, "ipv4");
  if (family === 6) return BLOCKED.check(address, "ipv6");
  return true;
}

export function checkAttachmentUrl(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  if (url.port && url.port !== "443") return null;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host.toLowerCase() === "localhost" || (isIP(host) && isBlockedAddress(host))) return null;
  return url;
}

export type AttachmentRequest = (url: URL, signal: AbortSignal) => Promise<IncomingMessage>;

/**
 * Checks the address the socket will actually use, so a hostname cannot pass
 * validation and then re-resolve to an internal address.
 */
const guardedLookup: typeof dnsLookup = ((
  hostname: string,
  options: { all?: boolean },
  callback: (error: Error | null, address?: unknown, family?: number) => void
) => {
  dnsLookup(hostname, { all: true }, (error, addresses) => {
    if (error) return callback(error);
    if (!addresses.length || addresses.some((item) => isBlockedAddress(item.address))) {
      return callback(new Error("Blocked address"));
    }
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0]!.address, addresses[0]!.family);
  });
}) as typeof dnsLookup;

const httpsRequest: AttachmentRequest = (url, signal) =>
  new Promise((resolve, reject) => {
    const req = request(url, { lookup: guardedLookup, agent: false, signal }, resolve);
    req.on("error", reject);
    req.end();
  });

export async function fetchAttachmentUrl(
  source: McpUrlAttachment,
  send: AttachmentRequest = httpsRequest
): Promise<{ ok: true; value: McpUpload } | { ok: false; error: string }> {
  let url = checkAttachmentUrl(source.url);
  if (!url) {
    return { ok: false, error: `${source.url} must be a public https URL.` };
  }
  const filename = source.filename ?? filenameFromUrl(url);
  const failed = (reason: string) => ({
    ok: false as const,
    error: `Could not fetch ${filename}: ${reason}.`,
  });

  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  try {
    for (let hops = 0; ; hops += 1) {
      const response = await send(url, signal);
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        if (hops >= MAX_REDIRECTS) return failed("too many redirects");
        const next = checkAttachmentUrl(new URL(response.headers.location, url).toString());
        if (!next) return failed("it redirects to a URL that is not public https");
        url = next;
        continue;
      }
      if (status !== 200) {
        response.resume();
        return failed(`the server returned ${status}`);
      }

      const chunks: Buffer[] = [];
      let total = 0;
      for await (const chunk of response) {
        total += (chunk as Buffer).length;
        if (total > MAX_MCP_ATTACHMENT_BYTES) {
          response.destroy();
          return {
            ok: false,
            error: `${filename} is too large. Files sent through MCP must be under ${MAX_MCP_ATTACHMENT_BYTES / (1024 * 1024)} MB. Use create_attachment_upload for larger files.`,
          };
        }
        chunks.push(chunk as Buffer);
      }
      return uploadFromBytes(filename, Buffer.concat(chunks));
    }
  } catch {
    return failed("the request failed or timed out");
  }
}

function filenameFromUrl(url: URL): string {
  let name: string;
  try {
    name = decodeURIComponent(url.pathname);
  } catch {
    name = url.pathname;
  }
  return cleanFilename(name) ?? "attachment";
}
