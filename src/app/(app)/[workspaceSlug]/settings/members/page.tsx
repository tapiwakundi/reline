import { requireWorkspaceBySlug } from "@/lib/session";
import { getWorkspaceSettings } from "@/lib/queries";
import { SettingsMembers } from "@/components/settings/settings-members";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const { workspace, membership, user } =
    await requireWorkspaceBySlug(workspaceSlug);
  const initialData = await getWorkspaceSettings(
    workspace,
    membership.role,
    user.id
  );

  return <SettingsMembers initialData={initialData} />;
}
