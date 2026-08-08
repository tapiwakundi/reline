import type { Metadata } from "next";
import { requireWorkspaceBySlug } from "@/lib/session";
import { getWorkspaceSettings } from "@/lib/queries";
import { LabelsManager } from "@/components/settings/labels-manager";

export const metadata: Metadata = { title: "Labels" };

export default async function LabelsPage({
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

  return <LabelsManager initialData={initialData} />;
}
