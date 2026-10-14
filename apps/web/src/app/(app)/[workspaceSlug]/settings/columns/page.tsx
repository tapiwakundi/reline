import type { Metadata } from "next";
import { ColumnsManager } from "@/components/settings/columns-manager";
import { serverApi } from "@/lib/server-api";
import type { WorkspaceSettings } from "@/lib/types";

export const metadata: Metadata = { title: "Columns" };

export default async function ColumnsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const initialData = await serverApi<WorkspaceSettings>("/api/workspace", {
    workspaceSlug,
  });

  return <ColumnsManager initialData={initialData} />;
}
