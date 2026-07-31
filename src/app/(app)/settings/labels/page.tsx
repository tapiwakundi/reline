import { requireWorkspace } from "@/lib/session";
import { getWorkspaceSettings } from "@/lib/queries";
import { LabelsManager } from "@/components/settings/labels-manager";

export default async function LabelsPage() {
  const { workspace, membership, user } = await requireWorkspace();
  const initialData = await getWorkspaceSettings(
    workspace,
    membership.role,
    user.id
  );

  return <LabelsManager initialData={initialData} />;
}
