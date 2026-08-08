import { Suspense } from "react";
import type { Metadata } from "next";
import { requireWorkspaceBySlug } from "@/lib/session";
import { getIssues } from "@/lib/queries";
import { IssuesView } from "@/components/issues/issues-view";

export const metadata: Metadata = { title: "Issues" };

export default async function IssuesPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const { workspace } = await requireWorkspaceBySlug(workspaceSlug);
  const issues = await getIssues(workspace.id, workspace.prefix);

  return (
    <Suspense>
      <IssuesView issues={issues} title="All issues" />
    </Suspense>
  );
}
