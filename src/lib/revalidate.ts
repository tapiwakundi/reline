import { revalidatePath } from "next/cache";
import { wsPath } from "@/lib/workspace-slug";

/** Revalidate common workspace-scoped list views. */
export function revalidateWorkspaceLists(slug: string) {
  revalidatePath(wsPath(slug, "/board"));
  revalidatePath(wsPath(slug, "/issues"));
  revalidatePath(wsPath(slug, "/my-issues"));
  revalidatePath(wsPath(slug, "/inbox"));
  revalidatePath(wsPath(slug, "/cycles"));
  revalidatePath(wsPath(slug, "/backlog"));
}
