import { requireWorkspaceBySlug } from "@/lib/session";
import { getCyclesList } from "@/lib/queries";
import { CyclesView } from "@/components/cycles/cycles-view";

export default async function CyclesPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const { workspace } = await requireWorkspaceBySlug(workspaceSlug);
  const cycles = await getCyclesList(workspace.id);
  return <CyclesView cycles={cycles} />;
}
