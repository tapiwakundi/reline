import type { Metadata } from "next";
import { EpicsView } from "@/components/epics/epics-view";
import { serverApi } from "@/lib/server-api";
import type { IssueListItem } from "@/lib/types";

export const metadata: Metadata = { title: "Epics" };

export default async function EpicsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const { issues } = await serverApi<{ issues: IssueListItem[] }>(
    "/api/issues",
    { workspaceSlug }
  );
  return <EpicsView issues={issues} />;
}
