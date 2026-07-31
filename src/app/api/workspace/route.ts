import { requireApiWorkspace } from "@/lib/api-auth";
import { getWorkspaceSettings } from "@/lib/queries";

export async function GET() {
  const ctx = await requireApiWorkspace();
  if ("error" in ctx) return ctx.error;

  const settings = await getWorkspaceSettings(
    ctx.workspace,
    ctx.membership.role,
    ctx.user.id
  );
  return Response.json(settings);
}