"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "@/lib/workspace-context";
import { wsPath } from "@/lib/workspace-paths";
import {
  optimisticUpdateIssue,
  type IssuePatch,
} from "@/lib/optimistic-issues";
import type { IssueListItem } from "@/lib/types";
import {
  AssigneePicker,
  PriorityPicker,
  StatusPicker,
} from "@/components/pickers";
import { IssueContextMenu } from "@/components/issues/issue-context-menu";

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function IssueRow({ issue }: { issue: IssueListItem }) {
  const { workspace, labels, statuses, cycles } = useWorkspace();
  const qc = useQueryClient();
  const [, startTransition] = useTransition();

  const issueLabels = labels.filter((l) => issue.labelIds.includes(l.id));

  function patch(p: IssuePatch) {
    startTransition(async () => {
      await optimisticUpdateIssue(
        qc,
        workspace.id,
        {
          id: issue.id,
          identifier: issue.identifier,
          statusId: issue.statusId,
          cycleId: issue.cycleId,
        },
        p,
        statuses,
        cycles
      );
    });
  }

  return (
    <IssueContextMenu issue={issue}>
      <div className="group flex h-10 items-center gap-2.5 border-b border-border/60 px-4 transition-colors hover:bg-accent/40">
        <PriorityPicker
          value={issue.priority}
          onChange={(priority) => patch({ priority })}
          compact
        />
        <span className="w-16 shrink-0 text-xs text-muted-foreground">
          {issue.identifier}
        </span>
        <StatusPicker
          value={issue.statusId}
          onChange={(statusId) => patch({ statusId })}
          compact
        />
        <Link
          href={wsPath(workspace.slug, `/issue/${issue.identifier}`)}
          className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground hover:text-foreground"
        >
          {issue.title}
        </Link>
        <div className="hidden items-center gap-1 md:flex">
          {issueLabels.slice(0, 3).map((l) => (
            <span
              key={l.id}
              className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground"
            >
              <span className="size-2 rounded-full" style={{ background: l.color }} />
              {l.name}
            </span>
          ))}
        </div>
        <span className="hidden w-10 shrink-0 text-right text-[11px] text-muted-foreground sm:block">
          {formatDate(issue.createdAt)}
        </span>
        <AssigneePicker
          value={issue.assigneeId}
          onChange={(assigneeId) => patch({ assigneeId })}
          compact
        />
      </div>
    </IssueContextMenu>
  );
}
