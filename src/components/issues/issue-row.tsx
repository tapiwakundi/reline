"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { updateIssue } from "@/lib/actions/issues";
import { useWorkspace } from "@/lib/workspace-context";
import type { IssueListItem } from "@/lib/types";
import {
  AssigneePicker,
  PriorityPicker,
  StatusPicker,
} from "@/components/pickers";

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function IssueRow({ issue }: { issue: IssueListItem }) {
  const { labels } = useWorkspace();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const issueLabels = labels.filter((l) => issue.labelIds.includes(l.id));

  function patch(p: Parameters<typeof updateIssue>[1]) {
    startTransition(async () => {
      await updateIssue(issue.id, p);
      router.refresh();
    });
  }

  return (
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
        href={`/issue/${issue.identifier}`}
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
  );
}
