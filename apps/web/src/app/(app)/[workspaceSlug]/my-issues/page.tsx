import { Suspense } from "react";
import type { Metadata } from "next";
import { IssuesView } from "@/components/issues/issues-view";
import { serverApi } from "@/lib/server-api";
import type { IssueListItem, WorkspaceBootstrap } from "@/lib/types";

export const metadata: Metadata = { title: "My issues" };

export default async function MyIssuesPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const [boot, { issues }] = await Promise.all([
    serverApi<WorkspaceBootstrap>(
      `/api/workspaces/${encodeURIComponent(workspaceSlug)}/bootstrap`,
      { workspaceSlug }
    ),
    serverApi<{ issues: IssueListItem[] }>("/api/issues", { workspaceSlug }),
  ]);

  return (
    <Suspense>
      <IssuesView
        issues={issues}
        title="My issues"
        fixedAssigneeId={boot.me.id}
      />
    </Suspense>
  );
}
