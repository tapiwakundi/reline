"use client";

import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { epicProgress } from "@reline/shared";
import { Button } from "@/components/ui/button";
import { TypeIcon } from "@/components/issue-type-icon";
import { MobileNavButton } from "@/components/mobile-nav";
import { useShortcuts } from "@/components/global-shortcuts";
import { useIssuesList } from "@/lib/hooks/queries";
import { useWorkspace } from "@/lib/workspace-context";
import { wsPath } from "@/lib/workspace-paths";
import type { IssueListItem } from "@/lib/types";

export function EpicsView({ issues: initialIssues }: { issues: IssueListItem[] }) {
  const { workspace, statuses } = useWorkspace();
  const { openCreateIssue } = useShortcuts();
  const { data: issues } = useIssuesList(initialIssues);
  const list = issues ?? initialIssues;
  const epics = list
    .filter((issue) => issue.type === "epic")
    .sort((a, b) => a.identifier.localeCompare(b.identifier));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        <MobileNavButton />
        <h1 className="text-sm font-medium">Epics</h1>
        <Button
          size="sm"
          className="ml-auto h-7 gap-1"
          onClick={() => openCreateIssue({ type: "epic" })}
        >
          <PlusIcon className="size-3.5" />
          New epic
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {epics.length === 0 ? (
          <div className="flex flex-col items-start gap-3 px-6 py-16">
            <p className="text-sm text-muted-foreground">
              Epics group the stories, tasks, and bugs that make up a larger
              piece of work.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => openCreateIssue({ type: "epic" })}
            >
              Create an epic
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col">
            {epics.map((epic) => {
              const children = list.filter((issue) => issue.epicId === epic.id);
              const progress = epicProgress(children, statuses);
              const width =
                progress.total === 0
                  ? "0%"
                  : `${Math.round((progress.done / progress.total) * 100)}%`;
              return (
                <li key={epic.id} className="border-b border-border/60">
                  <Link
                    href={wsPath(workspace.slug, `/issue/${epic.identifier}`)}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-foreground/5"
                  >
                    <TypeIcon type="epic" className="size-4" />
                    <span className="w-16 shrink-0 text-xs text-muted-foreground">
                      {epic.identifier}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {epic.title}
                    </span>
                    <span className="hidden w-28 items-center gap-2 sm:flex">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-[#b59aeb]"
                          style={{ width }}
                        />
                      </span>
                      <span className="w-10 shrink-0 text-right text-[11px] text-muted-foreground">
                        {progress.done}/{progress.total}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
