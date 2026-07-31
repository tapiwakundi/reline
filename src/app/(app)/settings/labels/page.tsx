import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { labels } from "@/db/schema";
import { requireWorkspace } from "@/lib/session";
import { LabelsManager } from "@/components/settings/labels-manager";

export default async function LabelsPage() {
  const { workspace } = await requireWorkspace();
  const rows = await db.query.labels.findMany({
    where: eq(labels.workspaceId, workspace.id),
    orderBy: asc(labels.name),
  });

  return <LabelsManager labels={rows} />;
}
