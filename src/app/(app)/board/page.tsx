import { Suspense } from "react";
import { requireWorkspace } from "@/lib/session";
import { getIssues } from "@/lib/queries";
import { Board } from "@/components/board/board";

export default async function BoardPage() {
  const { workspace } = await requireWorkspace();
  const issues = await getIssues(workspace.id, workspace.prefix);

  return (
    <Suspense>
      <Board issues={issues} />
    </Suspense>
  );
}
