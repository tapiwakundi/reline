import { Suspense } from "react";
import { requireWorkspaceBySlug } from "@/lib/session";
import { getIssues } from "@/lib/queries";
import { IssuesView } from "@/components/issues/issues-view";

export default async function BacklogPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const { workspace } = await requireWorkspaceBySlug(workspaceSlug);
  const issues = await getIssues(workspace.id, workspace.prefix);

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
