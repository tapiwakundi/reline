import { requireApiWorkspace } from "@/lib/api-auth";
import { getUnreadCount } from "@/lib/queries";

export async function GET(request: Request) {
  const ctx = await requireApiWorkspace(request);
  if ("error" in ctx) return ctx.error;
  const count = await getUnreadCount(ctx.user.id, ctx.workspace.id);
  return Response.json({ count });
}
