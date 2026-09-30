import { Suspense } from "react";
import type { Metadata } from "next";
import { IssuesView } from "@/components/issues/issues-view";
import { serverApi } from "@/lib/server-api";
import type { IssueListItem } from "@/lib/types";

export const metadata: Metadata = { title: "Issues" };

export default async function IssuesPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const { issues } = await serverApi<{ issues: IssueListItem[] }>(
    "/api/issues",
    { workspaceSlug }
  );

  return (
    <Suspense>
      <IssuesView issues={issues} title="All issues" />
    </Suspense>
  );
}
