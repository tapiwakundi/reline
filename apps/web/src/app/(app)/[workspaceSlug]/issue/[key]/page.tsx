import { Suspense } from "react";
import type { Metadata } from "next";
import { IssueDetail } from "@/components/issues/issue-detail";
import { serverApi } from "@/lib/server-api";
import type { IssueDetailData } from "@/lib/types";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ workspaceSlug: string; key: string }>;
}): Promise<Metadata> {
  const { workspaceSlug, key } = await params;
  try {
    const data = await serverApi<IssueDetailData>(
      `/api/issues/${encodeURIComponent(key)}`,
      { workspaceSlug }
    );
    const title = data.issue.title.trim() || "Untitled";
    return { title: `${data.issue.identifier} · ${title}` };
  } catch {
    return { title: key };
  }
}

export default async function IssuePage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; key: string }>;
}) {
  const { workspaceSlug, key } = await params;
  const data = await serverApi<IssueDetailData>(
    `/api/issues/${encodeURIComponent(key)}`,
    { workspaceSlug }
  );
  return (
    <Suspense>
      <IssueDetail initialData={data} />
    </Suspense>
  );
}
