import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { RESERVED_SLUGS } from "@/lib/workspace-paths";

export {
  RESERVED_SLUGS,
  WORKSPACE_SLUG_COOKIE,
  wsPath,
} from "@/lib/workspace-paths";

export function slugifyName(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "workspace";
}

/** Allocate a unique slug derived from a workspace name. */
export async function allocateUniqueSlug(name: string): Promise<string> {
  let candidate = slugifyName(name);
  if (RESERVED_SLUGS.has(candidate)) {
    candidate = `${candidate}-ws`;
  }

  for (let i = 0; i < 20; i++) {
    const trySlug =
      i === 0 ? candidate : `${candidate}-${nanoid(4).toLowerCase()}`;
    if (RESERVED_SLUGS.has(trySlug)) continue;
    const existing = await db.query.workspaces.findFirst({
      where: eq(workspaces.slug, trySlug),
      columns: { id: true },
    });
    if (!existing) return trySlug;
  }

  return `${candidate}-${nanoid(8).toLowerCase()}`;
}
