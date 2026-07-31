import { requireApiWorkspace } from "@/lib/api-auth";
import { getInbox } from "@/lib/queries";

export async function GET() {
  const ctx = await requireApiWorkspace();
  if ("error" in ctx) return ctx.error;

  const notifications = await getInbox(ctx.user.id, ctx.workspace.prefix);
  return Response.json({ notifications });
}
