import type { Metadata } from "next";
import { CyclesView } from "@/components/cycles/cycles-view";
import { serverApi } from "@/lib/server-api";
import type { CycleListItem } from "@/lib/types";

export const metadata: Metadata = { title: "Cycles" };

export default async function CyclesPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const { cycles } = await serverApi<{ cycles: CycleListItem[] }>(
    "/api/cycles",
    { workspaceSlug }
  );
  return <CyclesView cycles={cycles} />;
}
