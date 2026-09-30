import { RESERVED_SLUGS } from "@reline/shared";

export function workspaceSlugFromPath(
  pathname = typeof window !== "undefined" ? window.location.pathname : ""
): string {
  const slug = pathname.split("/").filter(Boolean)[0];
  if (!slug || RESERVED_SLUGS.has(slug)) {
    throw new Error("Workspace required");
  }
  return slug;
}
