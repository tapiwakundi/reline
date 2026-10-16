export const STATIC_OAUTH_CLIENT_ID = "reline";
export const STATIC_OAUTH_CLIENT_NAME = "Cursor";
export const CURSOR_MCP_DEEPLINK =
  "cursor://anysphere.cursor-mcp/oauth/callback";

export const STATIC_REDIRECT_URIS = [
  "http://localhost:8787/callback",
  "http://127.0.0.1:8787/callback",
  "https://www.cursor.com/agents/mcp/oauth/callback",
  CURSOR_MCP_DEEPLINK,
] as const;

export function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function isAllowedRedirectUri(value: string): boolean {
  if (value === CURSOR_MCP_DEEPLINK) return true;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  if (url.protocol === "https:") return true;
  if (url.protocol === "http:" && isLoopbackHost(url.hostname)) return true;
  return false;
}

export function filterRedirectUris(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const allowed: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed) || !isAllowedRedirectUri(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    allowed.push(trimmed);
  }
  return allowed;
}

export function redirectHost(uri: string): string {
  if (uri === CURSOR_MCP_DEEPLINK) return "cursor://";
  try {
    const url = new URL(uri);
    if (url.port) return `${url.hostname}:${url.port}`;
    return url.hostname;
  } catch {
    return uri;
  }
}

export function isLoopbackRedirect(uri: string): boolean {
  if (uri === CURSOR_MCP_DEEPLINK) return false;
  try {
    const url = new URL(uri);
    return url.protocol === "http:" && isLoopbackHost(url.hostname);
  } catch {
    return false;
  }
}

export function withOAuthQuery(
  redirectUri: string,
  params: Record<string, string | undefined>
): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    url.searchParams.set(key, value);
  }
  return url.toString();
}
