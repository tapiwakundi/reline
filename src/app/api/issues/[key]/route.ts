import { requireApiWorkspace } from "@/lib/api-auth";
import { getIssueDetail } from "@/lib/queries";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  const ctx = await requireApiWorkspace();
  if ("error" in ctx) return ctx.error;

  const { key } = await params;
  const data = await getIssueDetail(
    ctx.workspace.id,
    ctx.workspace.prefix,
    decodeURIComponent(key)
  );
  if (!data) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json(data);
}
