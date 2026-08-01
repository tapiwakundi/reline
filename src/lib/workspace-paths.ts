/** Root path segments that must never be used as workspace slugs. */
export const RESERVED_SLUGS = new Set([
  "login",
  "signup",
  "onboarding",
  "invite",
  "api",
  "_next",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
]);

export const WORKSPACE_SLUG_COOKIE = "workspace_slug";

/** Build a workspace-scoped path: wsPath("acme", "/board") → "/acme/board" */
export function wsPath(slug: string, path: string = ""): string {
  const suffix = path.startsWith("/") ? path : path ? `/${path}` : "";
  return `/${slug}${suffix}`;
}
