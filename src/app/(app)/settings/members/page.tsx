import { requireWorkspace } from "@/lib/session";
import { getWorkspaceSettings } from "@/lib/queries";
import { SettingsMembers } from "@/components/settings/settings-members";

export default async function MembersPage() {
  const { workspace, membership, user } = await requireWorkspace();
  const initialData = await getWorkspaceSettings(
    workspace,
    membership.role,
    user.id
  );

  return <SettingsMembers initialData={initialData} />;
}
