const MAX_DISTINCT_ID_LENGTH = 200;

export const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

/** Browser path. The API forwards this to PostHog, so the static app never calls posthog.com. */
export const POSTHOG_PROXY_PATH = "/api/rline";

export function normalizePostHogHost(raw: string | undefined): string {
  const value = (raw || DEFAULT_POSTHOG_HOST).trim().replace(/\/$/, "");
  return value || DEFAULT_POSTHOG_HOST;
}

/** Toolbar links use the PostHog app, not the ingest host. */
export function posthogUiHost(ingestHost: string): string {
  if (
    ingestHost.includes("eu.i.posthog.com") ||
    ingestHost.includes("eu.posthog.com")
  ) {
    return "https://eu.posthog.com";
  }
  if (
    ingestHost.includes("us.i.posthog.com") ||
    ingestHost.includes("us.posthog.com")
  ) {
    return "https://us.posthog.com";
  }
  return ingestHost;
}

/** Session replay and remote config are served from the asset host. */
export function posthogAssetsHost(ingestHost: string): string {
  if (ingestHost.includes("eu.i.posthog.com")) {
    return "https://eu-assets.i.posthog.com";
  }
  if (ingestHost.includes("us.i.posthog.com")) {
    return "https://us-assets.i.posthog.com";
  }
  return ingestHost;
}

/**
 * Map `/api/rline/...` onto PostHog. Returns null for every other path so the
 * route cannot be used as an open proxy.
 */
export function posthogProxyTarget(
  pathname: string,
  search: string,
  ingestHost: string
): string | null {
  if (pathname.includes("..")) return null;
  if (pathname !== POSTHOG_PROXY_PATH && !pathname.startsWith(`${POSTHOG_PROXY_PATH}/`)) {
    return null;
  }
  const rest = pathname.slice(POSTHOG_PROXY_PATH.length) || "/";
  const assets = rest.startsWith("/static/") || rest.startsWith("/array/");
  const url = new URL(assets ? posthogAssetsHost(ingestHost) : ingestHost);
  url.pathname = rest;
  url.search = search;
  return url.toString();
}

/** Drop blank, oversized, or control-character ids so a spoofed header cannot poison events. */
export function sanitizeDistinctId(
  value: string | null | undefined
): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_DISTINCT_ID_LENGTH) return undefined;
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return undefined;
  return trimmed;
}

/**
 * Read the distinct id PostHog stores in its first-party cookie
 * (`ph_phc_…_posthog`). Returns undefined when the cookie is missing or malformed.
 */
export function posthogDistinctIdFromCookie(
  cookieHeader: string | null | undefined
): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(
    /(?:^|;\s*)ph_phc_[^=;\s]+_posthog=([^;]*)/
  );
  if (!match?.[1]) return undefined;

  let decoded = match[1];
  try {
    decoded = decodeURIComponent(match[1]);
  } catch {
    decoded = match[1];
  }

  try {
    const data = JSON.parse(decoded) as { distinct_id?: unknown };
    return sanitizeDistinctId(
      typeof data.distinct_id === "string" ? data.distinct_id : undefined
    );
  } catch {
    return undefined;
  }
}

/**
 * Prefer the authenticated user id, then the tracing header the browser SDK
 * attaches, then the PostHog cookie.
 */
export function resolvePostHogDistinctId(input: {
  userId?: string | null;
  header?: string | null;
  cookie?: string | null;
}): string | undefined {
  return (
    sanitizeDistinctId(input.userId) ??
    sanitizeDistinctId(input.header) ??
    posthogDistinctIdFromCookie(input.cookie)
  );
}

/** Strip query and hash so tokens in the URL are not stored on an event. */
export function pathWithoutSearch(path: string): string {
  const query = path.indexOf("?");
  const hash = path.indexOf("#");
  let end = path.length;
  if (query >= 0) end = Math.min(end, query);
  if (hash >= 0) end = Math.min(end, hash);
  return path.slice(0, end);
}
