import { requireApiWorkspace } from "@/lib/api-auth";
import { getCyclesList } from "@/lib/queries";

export async function GET(request: Request) {
  const ctx = await requireApiWorkspace(request);
  if ("error" in ctx) return ctx.error;

  const cycles = await getCyclesList(ctx.workspace.id);
  return Response.json({ cycles });
}
