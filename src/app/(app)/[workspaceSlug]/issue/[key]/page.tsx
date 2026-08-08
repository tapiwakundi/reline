import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireWorkspaceBySlug } from "@/lib/session";
import { getIssueDetail } from "@/lib/queries";
import { IssueDetail } from "@/components/issues/issue-detail";

export default async function IssuePage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; key: string }>;
}) {
  const { workspaceSlug, key } = await params;
  const { workspace } = await requireWorkspaceBySlug(workspaceSlug);
  const data = await getIssueDetail(workspace.id, workspace.prefix, key);
  if (!data) notFound();
  return (
    <Suspense>
      <IssueDetail initialData={data} />
    </Suspense>
  );
}
