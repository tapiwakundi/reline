"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { buttonVariants } from "@/components/ui/button";
import { TypeIcon } from "@/components/issue-type-icon";
import { useIssuesList } from "@/lib/hooks/queries";
import { optimisticUpdateIssue } from "@/lib/optimistic-issues";
import { queryKeys } from "@/lib/query-keys";
import { useWorkspace } from "@/lib/workspace-context";
import { cn } from "@/lib/utils";
import type { IssueDetailData, IssueListItem } from "@/lib/types";

export function AddEpicIssue({
  epic,
  excludeIds,
  onCreate,
}: {
  epic: { id: string; identifier: string };
  excludeIds: string[];
  onCreate: () => void;
}) {
  const { workspace, statuses, cycles } = useWorkspace();
  const qc = useQueryClient();
  const { data: issues = [] } = useIssuesList();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const excluded = new Set(excludeIds);
  const candidates = issues
    .filter(
      (issue) =>
        issue.type !== "epic" &&
        issue.id !== epic.id &&
        issue.epicId !== epic.id &&
        !excluded.has(issue.id)
    )
    .sort((a, b) => a.identifier.localeCompare(b.identifier));

  async function add(issue: IssueListItem) {
    setSaving(true);
    setOpen(false);
    try {
      await optimisticUpdateIssue(
        qc,
        workspace.id,
        {
          id: issue.id,
          identifier: issue.identifier,
          statusId: issue.statusId,
          cycleId: issue.cycleId,
        },
        { epicId: epic.id },
        statuses,
        cycles
      );
      qc.setQueryData<IssueDetailData>(
        queryKeys.issues.detail(workspace.id, epic.identifier),
        (old) => {
          if (!old) return old;
          const children = old.children ?? [];
          if (children.some((child) => child.id === issue.id)) return old;
          return {
            ...old,
            children: [
              ...children,
              {
                id: issue.id,
                identifier: issue.identifier,
                title: issue.title,
                type: issue.type,
                statusId: issue.statusId,
                priority: issue.priority,
              },
            ],
          };
        }
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        disabled={saving}
      >
        Add issue
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <Command>
          <CommandInput placeholder="Search issues…" />
          <CommandList>
            <CommandEmpty>No matching issues.</CommandEmpty>
            <CommandGroup>
              {candidates.map((issue) => (
                <CommandItem
                  key={issue.id}
                  value={`${issue.identifier} ${issue.title}`}
                  disabled={saving}
                  onSelect={() => {
                    void add(issue);
                  }}
                >
                  <TypeIcon type={issue.type} />
                  <span className="shrink-0 text-muted-foreground">
                    {issue.identifier}
                  </span>
                  <span className="min-w-0 truncate">{issue.title}</span>
                  {issue.epic && (
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                      {issue.epic.identifier}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          <div className="border-t border-border p-1">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
              onClick={() => {
                setOpen(false);
                onCreate();
              }}
            >
              <PlusIcon className="size-3.5" />
              Create new issue
            </button>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
