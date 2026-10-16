/** Bot scopes requested when a workspace owner installs Slack. */
export const SLACK_BOT_SCOPES = [
  "groups:write",
  "groups:read",
  "groups:history",
  "chat:write",
  "users:read",
  "users:read.email",
  "links:read",
  "links:write",
] as const;

const UNFURL_SCOPES = ["links:read", "links:write"] as const;

/** True when this install can receive link_shared and call chat.unfurl. */
export function installationCanUnfurl(scopes: string | null | undefined): boolean {
  if (!scopes) return false;
  const granted = new Set(scopes.split(/[\s,]+/).filter(Boolean));
  return UNFURL_SCOPES.every((scope) => granted.has(scope));
}
