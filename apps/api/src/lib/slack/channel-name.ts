/** Slack-safe private channel name from an issue key and title, max 80 chars. */
export function slackChannelName(identifier: string, title: string): string {
  const raw = `${identifier}-${title}`.toLowerCase();
  let slug = raw
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) slug = identifier.toLowerCase().replace(/[^a-z0-9-]+/g, "") || "issue";
  if (slug.length <= 80) return slug;
  return slug.slice(0, 80).replace(/-+$/, "");
}

export function slackChannelNameWithSuffix(base: string, suffix: string): string {
  const tag = suffix.replace(/[^a-z0-9]+/g, "").slice(0, 6) || "dup";
  const trimmed = base.slice(0, Math.max(1, 80 - tag.length - 1)).replace(/-+$/, "");
  return `${trimmed}-${tag}`;
}
