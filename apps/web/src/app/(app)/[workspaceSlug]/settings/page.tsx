import type { Metadata } from "next";
import { SettingsGeneral } from "@/components/settings/settings-general";
import { serverApi } from "@/lib/server-api";
import type { WorkspaceSettings } from "@/lib/types";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsGeneralPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const initialData = await serverApi<WorkspaceSettings>("/api/workspace", {
    workspaceSlug,
  });

  return <SettingsGeneral initialData={initialData} />;
}
