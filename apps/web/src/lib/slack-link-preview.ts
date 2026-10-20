import { RESERVED_SLUGS } from "@reline/shared";

const ISSUE_PATH = /^\/([^/]+)\/issue\/([^/]+)\/?$/;

export function isSlackLinkExpandingAgent(userAgent: string | null | undefined): boolean {
  return (userAgent ?? "").includes("Slackbot-LinkExpanding");
}

/**
 * Internal path for Slack's crawler. Null for browsers and every other URL,
 * which keep the normal login redirect.
 */
export function slackLinkPreviewRewritePath(
  pathname: string,
  userAgent: string | null | undefined
): string | null {
  if (!isSlackLinkExpandingAgent(userAgent)) return null;
  const match = pathname.match(ISSUE_PATH);
  if (!match) return null;
  let slug: string;
  let key: string;
  try {
    slug = decodeURIComponent(match[1] ?? "");
    key = decodeURIComponent(match[2] ?? "");
  } catch {
    return null;
  }
  if (!slug || !key || RESERVED_SLUGS.has(slug.toLowerCase())) return null;
  return `/slack-link-preview/${encodeURIComponent(slug)}/${encodeURIComponent(key)}`;
}
