import type { Metadata } from "next";
import { LabelsManager } from "@/components/settings/labels-manager";
import { serverApi } from "@/lib/server-api";
import type { WorkspaceSettings } from "@/lib/types";

export const metadata: Metadata = { title: "Labels" };

export default async function LabelsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const initialData = await serverApi<WorkspaceSettings>("/api/workspace", {
    workspaceSlug,
  });

  return <LabelsManager initialData={initialData} />;
}
