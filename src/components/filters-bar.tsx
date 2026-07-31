"use client";

import { ListFilterIcon, XIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-context";
import { StatusIcon } from "@/components/status-icon";
import { PriorityIcon } from "@/components/priority-icon";
import { UserAvatar } from "@/components/user-avatar";
import { PRIORITIES } from "@/lib/defaults";
import {
  hasActiveFilters,
  type IssueFilters,
} from "@/lib/filtering";

export function FiltersBar({
  filters,
  onChange,
  hideAssignee,
}: {
  filters: IssueFilters;
  onChange: (f: IssueFilters) => void;
  hideAssignee?: boolean;
}) {
  const { statuses, labels, members, cycles } = useWorkspace();

  const toggle = <T,>(arr: T[], v: T): T[] =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  return (
    <div className="flex items-center gap-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "h-7 gap-1.5 text-xs text-muted-foreground"
          )}
        >
          <ListFilterIcon className="size-3.5" />
          Filter
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuLabel className="text-xs">Filter by</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Status</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {statuses.map((s) => (
                <DropdownMenuCheckboxItem
                  key={s.id}
                  checked={filters.statusIds.includes(s.id)}
                  onCheckedChange={() =>
                    onChange({ ...filters, statusIds: toggle(filters.statusIds, s.id) })
                  }
                  onSelect={(e) => e.preventDefault()}
                >
                  <span className="mr-2 inline-flex"><StatusIcon status={s} /></span>
                  {s.name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Priority</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {PRIORITIES.map((p) => (
                <DropdownMenuCheckboxItem
                  key={p.value}
                  checked={filters.priorities.includes(p.value)}
                  onCheckedChange={() =>
                    onChange({ ...filters, priorities: toggle(filters.priorities, p.value) })
                  }
                  onSelect={(e) => e.preventDefault()}
                >
                  <span className="mr-2 inline-flex"><PriorityIcon priority={p.value} /></span>
                  {p.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {!hideAssignee && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Assignee</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuCheckboxItem
                  checked={filters.assigneeIds.includes("none")}
                  onCheckedChange={() =>
                    onChange({ ...filters, assigneeIds: toggle(filters.assigneeIds, "none") })
                  }
                  onSelect={(e) => e.preventDefault()}
                >
                  <span className="mr-2 inline-flex"><UserAvatar user={null} className="size-4" /></span>
                  Unassigned
                </DropdownMenuCheckboxItem>
                {members.map((m) => (
                  <DropdownMenuCheckboxItem
                    key={m.id}
                    checked={filters.assigneeIds.includes(m.id)}
                    onCheckedChange={() =>
                      onChange({ ...filters, assigneeIds: toggle(filters.assigneeIds, m.id) })
                    }
                    onSelect={(e) => e.preventDefault()}
                  >
                    <span className="mr-2 inline-flex"><UserAvatar user={m} className="size-4" /></span>
                    {m.name}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          {labels.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Label</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {labels.map((l) => (
                  <DropdownMenuCheckboxItem
                    key={l.id}
                    checked={filters.labelIds.includes(l.id)}
                    onCheckedChange={() =>
                      onChange({ ...filters, labelIds: toggle(filters.labelIds, l.id) })
                    }
                    onSelect={(e) => e.preventDefault()}
                  >
                    <span
                      className="mr-2 size-2.5 rounded-full"
                      style={{ background: l.color }}
                    />
                    {l.name}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          {cycles.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Cycle</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuCheckboxItem
                  checked={filters.cycleIds.includes("none")}
                  onCheckedChange={() =>
                    onChange({ ...filters, cycleIds: toggle(filters.cycleIds, "none") })
                  }
                  onSelect={(e) => e.preventDefault()}
                >
                  No cycle
                </DropdownMenuCheckboxItem>
                {cycles.map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.id}
                    checked={filters.cycleIds.includes(c.id)}
                    onCheckedChange={() =>
                      onChange({ ...filters, cycleIds: toggle(filters.cycleIds, c.id) })
                    }
                    onSelect={(e) => e.preventDefault()}
                  >
                    {c.name}
                    {c.status === "active" && (
                      <span className="ml-1 text-[10px] text-primary">Active</span>
                    )}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {hasActiveFilters(filters) && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs text-muted-foreground"
          onClick={() =>
            onChange({
              statusIds: [],
              priorities: [],
              assigneeIds: [],
              labelIds: [],
              cycleIds: [],
            })
          }
        >
          <XIcon className="size-3" />
          Clear
        </Button>
      )}
    </div>
  );
}
