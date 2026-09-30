import { Suspense } from "react";
import type { Metadata } from "next";
import { IssuesView } from "@/components/issues/issues-view";
import { serverApi } from "@/lib/server-api";
import type { IssueListItem } from "@/lib/types";

export const metadata: Metadata = { title: "Backlog" };

export default async function BacklogPage({
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
      <IssuesView
        issues={issues}
        title="Backlog"
        fixedStatusType="backlog"
      />
    </Suspense>
  );
}
