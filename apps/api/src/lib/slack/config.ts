export function slackAppConfigured(): boolean {
  return Boolean(
    process.env.SLACK_CLIENT_ID &&
      process.env.SLACK_CLIENT_SECRET &&
      process.env.SLACK_SIGNING_SECRET &&
      process.env.SLACK_TOKEN_ENCRYPTION_KEY
  );
}

export function publicAppUrl(): string {
  return (process.env.BETTER_AUTH_URL ?? "http://localhost:4002").replace(
    /\/$/,
    ""
  );
}

/** Public API origin Slack calls. Ticket links still use `publicAppUrl()`. */
export function slackApiUrl(): string {
  return (process.env.API_PUBLIC_URL ?? publicAppUrl()).replace(/\/$/, "");
}

export function slackClientId(): string {
  const value = process.env.SLACK_CLIENT_ID;
  if (!value) throw new Error("SLACK_CLIENT_ID is not set");
  return value;
}

export function slackClientSecret(): string {
  const value = process.env.SLACK_CLIENT_SECRET;
  if (!value) throw new Error("SLACK_CLIENT_SECRET is not set");
  return value;
}

export function slackSigningSecret(): string {
  const value = process.env.SLACK_SIGNING_SECRET;
  if (!value) throw new Error("SLACK_SIGNING_SECRET is not set");
  return value;
}

export function slackOAuthSecret(): string {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value) throw new Error("BETTER_AUTH_SECRET is not set");
  return value;
}

export function slackRedirectUri(kind: "install" | "user"): string {
  const path =
    kind === "install" ? "/api/slack/oauth/callback" : "/api/slack/user/callback";
  return `${slackApiUrl()}${path}`;
}
