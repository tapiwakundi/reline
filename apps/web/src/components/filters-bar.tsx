"use client";

import { useMemo, useState } from "react";
import {
  CircleDashedIcon,
  ListFilterIcon,
  RefreshCwIcon,
  TagIcon,
  UserIcon,
  XIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-context";
import { StatusIcon } from "@/components/status-icon";
import { PriorityIcon } from "@/components/priority-icon";
import { UserAvatar } from "@/components/user-avatar";
import { PRIORITIES, ISSUE_TYPES } from "@/lib/defaults";
import { TypeIcon } from "@/components/issue-type-icon";
import {
  CYCLE_FILTER_PRESETS,
  EMPTY_FILTERS,
  cycleFilterLabel,
  hasActiveFilters,
  type CycleFilter,
  type IssueFilters,
} from "@/lib/filtering";
import type { IssueType } from "@/lib/types";

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

function joinLabels(labels: string[]) {
  if (labels.length === 0) return "…";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]}, ${labels[1]}`;
  return `${labels[0]} +${labels.length - 1}`;
}

function FilterChip({
  label,
  value,
  onClear,
}: {
  label: string;
  value: string;
  onClear: () => void;
}) {
  return (
    <div className="inline-flex h-7 items-center overflow-hidden rounded-md border border-border bg-muted/40 text-xs">
      <span className="inline-flex max-w-[220px] items-center gap-1 px-2 text-muted-foreground">
        <span className="shrink-0 font-medium">{label}</span>
        <span className="text-muted-foreground/50">is</span>
        <span className="truncate font-medium text-foreground">{value}</span>
      </span>
      <button
        type="button"
        aria-label={`Clear ${label} filter`}
        className="inline-flex h-full items-center border-l border-border px-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        onClick={onClear}
      >
        <XIcon className="size-3" />
      </button>
    </div>
  );
}

function SubmenuSearch({
  value,
  onChange,
  placeholder = "Filter…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="p-1.5 pb-1">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-7 text-xs"
        onKeyDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}

export function FiltersBar({
  filters,
  onChange,
  hideAssignee,
  iconOnly = false,
  toolbarEnd,
}: {
  filters: IssueFilters;
  onChange: (f: IssueFilters) => void;
  hideAssignee?: boolean;
  /** Circular icon trigger (Linear-style board toolbar). */
  iconOnly?: boolean;
  /** Extra controls after the filter icon (iconOnly mode). */
  toolbarEnd?: React.ReactNode;
}) {
  const { statuses, labels, members, cycles } = useWorkspace();
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cycleQuery, setCycleQuery] = useState("");
  const [statusQuery, setStatusQuery] = useState("");
  const [priorityQuery, setPriorityQuery] = useState("");
  const [typeQuery, setTypeQuery] = useState("");
  const [assigneeQuery, setAssigneeQuery] = useState("");
  const [labelQuery, setLabelQuery] = useState("");

  const orderedCycles = useMemo(
    () =>
      [...cycles].sort((a, b) => {
        const rank = (s: typeof a.status) =>
          s === "active" ? 0 : s === "planned" ? 1 : 2;
        return rank(a.status) - rank(b.status) || b.number - a.number;
      }),
    [cycles]
  );

  const q = query.trim().toLowerCase();
  const showStatus = !q || "status".includes(q);
  const showType = !q || "type".includes(q);
  const showPriority = !q || "priority".includes(q);
  const showAssignee = !hideAssignee && (!q || "assignee".includes(q));
  const showLabel =
    labels.length > 0 && (!q || "label".includes(q) || "labels".includes(q));
  const showCycle =
    cycles.length > 0 && (!q || "cycle".includes(q) || "cycles".includes(q));

  function setCycle(value: CycleFilter, checked: boolean) {
    onChange({
      ...filters,
      // Cycle filter is exclusive — one preset or cycle at a time.
      cycleIds: checked ? [value] : [],
    });
  }

  const cq = cycleQuery.trim().toLowerCase();
  const visiblePresets = CYCLE_FILTER_PRESETS.filter((p) =>
    !cq || p.label.toLowerCase().includes(cq)
  );
  const visibleCycles = orderedCycles.filter(
    (c) => !cq || c.name.toLowerCase().includes(cq)
  );

  const chips = (
    <>
      {filters.statusIds.length > 0 && (
        <FilterChip
          label="Status"
          value={joinLabels(
            filters.statusIds.map(
              (id) => statuses.find((s) => s.id === id)?.name ?? "Unknown"
            )
          )}
          onClear={() => onChange({ ...filters, statusIds: [] })}
        />
      )}
      {filters.types.length > 0 && (
        <FilterChip
          label="Type"
          value={joinLabels(
            filters.types.map(
              (t) => ISSUE_TYPES.find((x) => x.value === t)?.label ?? "Unknown"
            )
          )}
          onClear={() => onChange({ ...filters, types: [] })}
        />
      )}
      {filters.priorities.length > 0 && (
        <FilterChip
          label="Priority"
          value={joinLabels(
            filters.priorities.map(
              (p) => PRIORITIES.find((x) => x.value === p)?.label ?? "Unknown"
            )
          )}
          onClear={() => onChange({ ...filters, priorities: [] })}
        />
      )}
      {!hideAssignee && filters.assigneeIds.length > 0 && (
        <FilterChip
          label="Assignee"
          value={joinLabels(
            filters.assigneeIds.map((id) =>
              id === "none"
                ? "Unassigned"
                : (members.find((m) => m.id === id)?.name ?? "Unknown")
            )
          )}
          onClear={() => onChange({ ...filters, assigneeIds: [] })}
        />
      )}
      {filters.labelIds.length > 0 && (
        <FilterChip
          label="Label"
          value={joinLabels(
            filters.labelIds.map(
              (id) => labels.find((l) => l.id === id)?.name ?? "Unknown"
            )
          )}
          onClear={() => onChange({ ...filters, labelIds: [] })}
        />
      )}
      {filters.cycleIds.length > 0 && !iconOnly && (
        <FilterChip
          label="Cycle"
          value={joinLabels(
            filters.cycleIds.map((id) => cycleFilterLabel(id, cycles))
          )}
          onClear={() => onChange({ ...filters, cycleIds: [] })}
        />
      )}
      {hasActiveFilters(filters) &&
        !(
          iconOnly &&
          filters.statusIds.length === 0 &&
          filters.types.length === 0 &&
          filters.priorities.length === 0 &&
          filters.assigneeIds.length === 0 &&
          filters.labelIds.length === 0
        ) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs text-muted-foreground"
            onClick={() => onChange({ ...EMPTY_FILTERS })}
          >
            <XIcon className="size-3" />
            Clear
          </Button>
        )}
    </>
  );

  const menu = (
    <DropdownMenu
      open={menuOpen}
      onOpenChange={(open) => {
        setMenuOpen(open);
        if (!open) {
          setQuery("");
          setCycleQuery("");
          setStatusQuery("");
          setTypeQuery("");
          setPriorityQuery("");
          setAssigneeQuery("");
          setLabelQuery("");
        }
      }}
    >
      <DropdownMenuTrigger
        className={cn(
          iconOnly
            ? cn(
                buttonVariants({ variant: "secondary", size: "icon" }),
                "relative size-8 rounded-full text-muted-foreground hover:text-foreground"
              )
            : cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "h-7 gap-1.5 text-xs text-muted-foreground"
              )
        )}
        title="Filter"
      >
        <ListFilterIcon className="size-3.5" />
        {!iconOnly && "Filter"}
        {iconOnly && hasActiveFilters(filters) && (
          <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary" />
        )}
      </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <div className="p-1.5 pb-1">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Add filter…"
              className="h-7 text-xs"
              autoFocus
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
          <DropdownMenuSeparator />

          {showStatus && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <CircleDashedIcon className="size-4 text-muted-foreground" />
                Status
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-52 p-0">
                <SubmenuSearch
                  value={statusQuery}
                  onChange={setStatusQuery}
                />
                <DropdownMenuSeparator />
                <div className="max-h-64 overflow-y-auto p-1">
                  {statuses
                    .filter(
                      (s) =>
                        !statusQuery.trim() ||
                        s.name
                          .toLowerCase()
                          .includes(statusQuery.trim().toLowerCase())
                    )
                    .map((s) => (
                      <DropdownMenuCheckboxItem
                        key={s.id}
                        checked={filters.statusIds.includes(s.id)}
                        onCheckedChange={() =>
                          onChange({
                            ...filters,
                            statusIds: toggle(filters.statusIds, s.id),
                          })
                        }
                        onSelect={(e) => e.preventDefault()}
                      >
                        <span className="mr-2 inline-flex">
                          <StatusIcon status={s} />
                        </span>
                        {s.name}
                      </DropdownMenuCheckboxItem>
                    ))}
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          {showType && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <TypeIcon type="task" />
                Type
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-52 p-0">
                <SubmenuSearch value={typeQuery} onChange={setTypeQuery} />
                <DropdownMenuSeparator />
                <div className="max-h-64 overflow-y-auto p-1">
                  {ISSUE_TYPES.filter(
                    (t) =>
                      !typeQuery.trim() ||
                      t.label
                        .toLowerCase()
                        .includes(typeQuery.trim().toLowerCase())
                  ).map((t) => (
                    <DropdownMenuCheckboxItem
                      key={t.value}
                      checked={filters.types.includes(t.value)}
                      onCheckedChange={() =>
                        onChange({
                          ...filters,
                          types: toggle(filters.types, t.value as IssueType),
                        })
                      }
                      onSelect={(e) => e.preventDefault()}
                    >
                      <span className="mr-2 inline-flex">
                        <TypeIcon type={t.value} />
                      </span>
                      {t.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          {showPriority && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <PriorityIcon priority={2} />
                Priority
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-52 p-0">
                <SubmenuSearch
                  value={priorityQuery}
                  onChange={setPriorityQuery}
                />
                <DropdownMenuSeparator />
                <div className="max-h-64 overflow-y-auto p-1">
                  {PRIORITIES.filter(
                    (p) =>
                      !priorityQuery.trim() ||
                      p.label
                        .toLowerCase()
                        .includes(priorityQuery.trim().toLowerCase())
                  ).map((p) => (
                    <DropdownMenuCheckboxItem
                      key={p.value}
                      checked={filters.priorities.includes(p.value)}
                      onCheckedChange={() =>
                        onChange({
                          ...filters,
                          priorities: toggle(filters.priorities, p.value),
                        })
                      }
                      onSelect={(e) => e.preventDefault()}
                    >
                      <span className="mr-2 inline-flex">
                        <PriorityIcon priority={p.value} />
                      </span>
                      {p.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          {showAssignee && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <UserIcon className="size-4 text-muted-foreground" />
                Assignee
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-52 p-0">
                <SubmenuSearch
                  value={assigneeQuery}
                  onChange={setAssigneeQuery}
                />
                <DropdownMenuSeparator />
                <div className="max-h-64 overflow-y-auto p-1">
                  {(!assigneeQuery.trim() ||
                    "unassigned".includes(
                      assigneeQuery.trim().toLowerCase()
                    )) && (
                    <DropdownMenuCheckboxItem
                      checked={filters.assigneeIds.includes("none")}
                      onCheckedChange={() =>
                        onChange({
                          ...filters,
                          assigneeIds: toggle(filters.assigneeIds, "none"),
                        })
                      }
                      onSelect={(e) => e.preventDefault()}
                    >
                      <span className="mr-2 inline-flex">
                        <UserAvatar user={null} className="size-4" />
                      </span>
                      Unassigned
                    </DropdownMenuCheckboxItem>
                  )}
                  {members
                    .filter(
                      (m) =>
                        !assigneeQuery.trim() ||
                        m.name
                          .toLowerCase()
                          .includes(assigneeQuery.trim().toLowerCase())
                    )
                    .map((m) => (
                      <DropdownMenuCheckboxItem
                        key={m.id}
                        checked={filters.assigneeIds.includes(m.id)}
                        onCheckedChange={() =>
                          onChange({
                            ...filters,
                            assigneeIds: toggle(filters.assigneeIds, m.id),
                          })
                        }
                        onSelect={(e) => e.preventDefault()}
                      >
                        <span className="mr-2 inline-flex">
                          <UserAvatar user={m} className="size-4" />
                        </span>
                        {m.name}
                      </DropdownMenuCheckboxItem>
                    ))}
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          {showLabel && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <TagIcon className="size-4 text-muted-foreground" />
                Label
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-52 p-0">
                <SubmenuSearch value={labelQuery} onChange={setLabelQuery} />
                <DropdownMenuSeparator />
                <div className="max-h-64 overflow-y-auto p-1">
                  {labels
                    .filter(
                      (l) =>
                        !labelQuery.trim() ||
                        l.name
                          .toLowerCase()
                          .includes(labelQuery.trim().toLowerCase())
                    )
                    .map((l) => (
                      <DropdownMenuCheckboxItem
                        key={l.id}
                        checked={filters.labelIds.includes(l.id)}
                        onCheckedChange={() =>
                          onChange({
                            ...filters,
                            labelIds: toggle(filters.labelIds, l.id),
                          })
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
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          {showCycle && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <RefreshCwIcon className="size-4 text-muted-foreground" />
                Cycle
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56 p-0">
                <SubmenuSearch value={cycleQuery} onChange={setCycleQuery} />
                <DropdownMenuSeparator />
                <div className="max-h-72 overflow-y-auto p-1">
                  {visiblePresets.map((p) => (
                    <DropdownMenuCheckboxItem
                      key={p.value}
                      checked={filters.cycleIds.includes(p.value)}
                      onCheckedChange={(checked) =>
                        setCycle(p.value, !!checked)
                      }
                      onSelect={(e) => e.preventDefault()}
                    >
                      {p.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                  {visibleCycles.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      {visibleCycles.map((c) => (
                        <DropdownMenuCheckboxItem
                          key={c.id}
                          checked={filters.cycleIds.includes(c.id)}
                          onCheckedChange={(checked) =>
                            setCycle(c.id, !!checked)
                          }
                          onSelect={(e) => e.preventDefault()}
                        >
                          <span className="truncate">{c.name}</span>
                          {c.status === "active" && (
                            <span className="text-[10px] text-primary">
                              Current
                            </span>
                          )}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </>
                  )}
                </div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          {!showStatus &&
            !showType &&
            !showPriority &&
            !showAssignee &&
            !showLabel &&
            !showCycle && (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                No filters match
              </div>
            )}
        </DropdownMenuContent>
      </DropdownMenu>
  );

  if (iconOnly) {
    return (
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {chips}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {menu}
          {toolbarEnd}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {menu}
      {chips}
    </div>
  );
}
