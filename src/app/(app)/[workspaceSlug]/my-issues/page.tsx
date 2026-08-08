import { Suspense } from "react";
import type { Metadata } from "next";
import { requireWorkspaceBySlug } from "@/lib/session";
import { getIssues } from "@/lib/queries";
import { IssuesView } from "@/components/issues/issues-view";

export const metadata: Metadata = { title: "My issues" };

export default async function MyIssuesPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const { workspace, user } = await requireWorkspaceBySlug(workspaceSlug);
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
