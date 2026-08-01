import { requireWorkspaceBySlug } from "@/lib/session";
import { getWorkspaceSettings } from "@/lib/queries";
import { SettingsGeneral } from "@/components/settings/settings-general";

export default async function SettingsGeneralPage({
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

  return <SettingsGeneral initialData={initialData} />;
}
