"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { fetchJson } from "@/lib/fetch-json";
import { queryKeys } from "@/lib/query-keys";
import { useWorkspace } from "@/lib/workspace-context";
import { wsPath } from "@/lib/workspace-paths";
import type { IssueDetailData } from "@/lib/types";

/** Prefetch the issue route + detail API so click→open feels instant. */
export function usePrefetchIssue() {
  const router = useRouter();
  const qc = useQueryClient();
  const { workspace } = useWorkspace();

  return useCallback(
    (identifier: string, href?: string) => {
      const path = href ?? wsPath(workspace.slug, `/issue/${identifier}`);
      router.prefetch(path);
      void qc.prefetchQuery({
        queryKey: queryKeys.issues.detail(workspace.id, identifier),
        queryFn: () =>
          fetchJson<IssueDetailData>(
            `/api/issues/${encodeURIComponent(identifier)}`,
            { workspaceSlug: workspace.slug }
          ),
      });
    },
    [router, qc, workspace.id, workspace.slug]
  );
}
