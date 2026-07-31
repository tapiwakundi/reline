import { requireWorkspace } from "@/lib/session";
import { getCyclesList } from "@/lib/queries";
import { CyclesView } from "@/components/cycles/cycles-view";

export default async function CyclesPage() {
  const { workspace } = await requireWorkspace();
  const cycles = await getCyclesList(workspace.id);
  return <CyclesView cycles={cycles} />;
}
