/** Public web origin. MCP, auth, and Slack ticket links all use this. */
export function publicAppUrl(): string {
  return (process.env.BETTER_AUTH_URL ?? "http://localhost:4002").replace(
    /\/$/,
    ""
  );
}
