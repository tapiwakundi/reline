import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/session";
import { getIssueDetail } from "@/lib/queries";
import { IssueDetail } from "@/components/issues/issue-detail";

export default async function IssuePage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const { workspace } = await requireWorkspace();
  const data = await getIssueDetail(workspace.id, workspace.prefix, key);
  if (!data) notFound();

  return <IssueDetail initialData={data} />;
}
