import { requireWorkspace } from "@/lib/session";
import { getWorkspaceSettings } from "@/lib/queries";
import { SettingsGeneral } from "@/components/settings/settings-general";

export default async function SettingsGeneralPage() {
  const { workspace, membership, user } = await requireWorkspace();
  const initialData = await getWorkspaceSettings(
    workspace,
    membership.role,
    user.id
  );

  return <SettingsGeneral initialData={initialData} />;
}
