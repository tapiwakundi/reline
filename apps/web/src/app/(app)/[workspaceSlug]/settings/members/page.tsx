import type { Metadata } from "next";
import { SettingsMembers } from "@/components/settings/settings-members";
import { serverApi } from "@/lib/server-api";
import type { WorkspaceSettings } from "@/lib/types";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const initialData = await serverApi<WorkspaceSettings>("/api/workspace", {
    workspaceSlug,
  });

  return <SettingsMembers initialData={initialData} />;
}
