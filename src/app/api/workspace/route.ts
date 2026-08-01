import { requireApiWorkspace } from "@/lib/api-auth";
import { getWorkspaceSettings } from "@/lib/queries";

export async function GET(request: Request) {
  const ctx = await requireApiWorkspace(request);
  if ("error" in ctx) return ctx.error;

  const settings = await getWorkspaceSettings(
    ctx.workspace,
    ctx.membership.role,
    ctx.user.id
  );
  return Response.json(settings);
}