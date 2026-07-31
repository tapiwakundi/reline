import { Suspense } from "react";
import { requireWorkspace } from "@/lib/session";
import { getIssues } from "@/lib/queries";
import { IssuesView } from "@/components/issues/issues-view";

export default async function MyIssuesPage() {
  const { workspace, user } = await requireWorkspace();
  const issues = await getIssues(workspace.id, workspace.prefix);

  return (
    <Suspense>
      <IssuesView
        issues={issues}
        title="My issues"
        fixedAssigneeId={user.id}
      />
    </Suspense>
  );
}
