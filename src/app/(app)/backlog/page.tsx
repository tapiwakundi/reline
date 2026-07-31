import { Suspense } from "react";
import { requireWorkspace } from "@/lib/session";
import { getIssues } from "@/lib/queries";
import { IssuesView } from "@/components/issues/issues-view";

export default async function BacklogPage() {
  const { workspace } = await requireWorkspace();
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
