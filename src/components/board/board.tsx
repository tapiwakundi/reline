"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCorners,
  pointerWithin,
  rectIntersection,
  getFirstCollision,
  defaultDropAnimationSideEffects,
  useSensor,
  useSensors,
  useDroppable,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CircleDashedIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  moveIssueOnBoard,
  moveIssueOnBoardGrouped,
  type BoardMoveTarget,
} from "@/lib/actions/issues";
import { useWorkspace } from "@/lib/workspace-context";
import { useShortcuts } from "@/components/global-shortcuts";
import { useBoardIssues } from "@/lib/hooks/queries";
import { queryKeys } from "@/lib/query-keys";
import type { IssueListItem } from "@/lib/types";
import {
  applyFilters,
  defaultCycleIdFromFilters,
  parseFilters,
  serializeBoardFilters,
  type IssueFilters,
} from "@/lib/filtering";
import { FiltersBar } from "@/components/filters-bar";
import { MobileNavButton } from "@/components/mobile-nav";
import { PRIORITIES } from "@/lib/defaults";
import { StatusIcon } from "@/components/status-icon";
import { PriorityIcon } from "@/components/priority-icon";
import { UserAvatar } from "@/components/user-avatar";
import { BoardCard, BoardCardContent } from "@/components/board/board-card";
import { BoardDisplayMenu } from "@/components/board/board-display-menu";
import { BoardSkeleton } from "@/components/skeletons/page-skeletons";
import type {
  BoardCardProperty,
  BoardColumnsGroup,
  BoardDisplayPrefs,
  BoardOrdering,
} from "@/lib/board-display";
import { todoStatusIdForCycleEntry } from "@/lib/issue-cycle";
import {
  applyPatchToListItem,
  resolveIssuePatch,
  type IssuePatch,
} from "@/lib/optimistic-issues";
import type { StatusRow } from "@/lib/types";

type BoardColumnDef = {
  key: string;
  title: string;
  icon: React.ReactNode;
  /** Set when grouping by status; used as the create-issue default. */
  statusId?: string;
  /** Done/canceled columns, for "order completed by recency". */
  isCompleted?: boolean;
};

function groupKeyOf(issue: IssueListItem, group: BoardColumnsGroup): string {
  switch (group) {
    case "status":
      return issue.statusId;
    case "assignee":
      return issue.assigneeId ?? "none";
    case "priority":
      return String(issue.priority);
    case "cycle":
      return issue.cycleId ?? "none";
  }
}

function applyGroupToIssue(
  issue: IssueListItem,
  group: BoardColumnsGroup,
  key: string,
  statuses: StatusRow[] = []
): IssueListItem {
  switch (group) {
    case "status":
      return { ...issue, statusId: key };
    case "assignee":
      return { ...issue, assigneeId: key === "none" ? null : key };
    case "priority":
      return { ...issue, priority: Number(key) };
    case "cycle": {
      const cycleId = key === "none" ? null : key;
      const statusId =
        todoStatusIdForCycleEntry(statuses, issue.statusId, cycleId) ??
        issue.statusId;
      return { ...issue, cycleId, statusId };
    }
  }
}

function moveTargetFor(group: BoardColumnsGroup, key: string): BoardMoveTarget {
  switch (group) {
    case "status":
      return { kind: "status", statusId: key };
    case "assignee":
      return { kind: "assignee", assigneeId: key === "none" ? null : key };
    case "priority":
      return { kind: "priority", priority: Number(key) };
    case "cycle":
      return { kind: "cycle", cycleId: key === "none" ? null : key };
  }
}

// Urgent > High > Medium > Low > No priority
const priorityRank = (p: number) => (p === 0 ? 5 : p);

function orderingComparator(
  ordering: BoardOrdering
): (a: IssueListItem, b: IssueListItem) => number {
  switch (ordering) {
    case "priority":
      return (a, b) =>
        priorityRank(a.priority) - priorityRank(b.priority) ||
        a.boardOrder - b.boardOrder;
    case "created":
      return (a, b) => b.createdAt.localeCompare(a.createdAt);
    case "updated":
      return (a, b) => b.updatedAt.localeCompare(a.updatedAt);
    case "title":
      return (a, b) => a.title.localeCompare(b.title);
    default:
      return (a, b) => a.boardOrder - b.boardOrder;
  }
}

const recencyComparator = (a: IssueListItem, b: IssueListItem) =>
  b.updatedAt.localeCompare(a.updatedAt);

const dropAnimation: DropAnimation = {
  duration: 120,
  easing: "ease-out",
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: "0" } },
  }),
};

function Column({
  column,
  issues,
  dragging,
  onNewIssue,
  properties,
  onIssuePatch,
  onIssueDelete,
}: {
  column: BoardColumnDef;
  issues: IssueListItem[];
  dragging: boolean;
  onNewIssue: () => void;
  properties: BoardCardProperty[];
  onIssuePatch: (issueId: string, patch: IssuePatch) => void;
  onIssueDelete: (issueId: string) => void;
}) {
  const { setNodeRef } = useDroppable({
    id: `col-${column.key}`,
    data: { columnKey: column.key, type: "column" },
  });

  return (
    <div className="group/col flex w-[300px] shrink-0 flex-col">
      <div className="flex h-9 items-center gap-2 px-1.5">
        {column.icon}
        <span className="text-[13px] font-medium">{column.title}</span>
        <span className="text-xs text-muted-foreground">{issues.length}</span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-6 text-muted-foreground"
          onClick={onNewIssue}
          title={`New issue in ${column.title}`}
        >
          <PlusIcon className="size-3.5" />
        </Button>
      </div>
      <SortableContext
        items={issues.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setNodeRef}
          className="flex min-h-[calc(100dvh-10rem)] flex-1 flex-col gap-2 rounded-lg p-1.5"
        >
          {issues.map((issue) => (
            <BoardCard
              key={issue.id}
              issue={issue}
              properties={properties}
              onOptimisticUpdate={(patch) => onIssuePatch(issue.id, patch)}
              onOptimisticDelete={() => onIssueDelete(issue.id)}
            />
          ))}
          {!dragging && (
            <button
              type="button"
              onClick={onNewIssue}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-transparent text-xs text-muted-foreground opacity-0 transition-all duration-150 group-hover/col:border-border/80 group-hover/col:opacity-100 hover:border-primary/45 hover:bg-primary/5 hover:text-foreground max-md:border-border/80 max-md:opacity-100"
            >
              <PlusIcon className="size-3.5" />
              Create new issue
            </button>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function orderKey(list: IssueListItem[]) {
  return list
    .map(
      (i) =>
        `${i.id}:${i.statusId}:${i.assigneeId}:${i.priority}:${i.cycleId}:${i.boardOrder}`
    )
    .join("|");
}

export function Board({
  issues: initialIssues,
  prefs: serverPrefs,
}: {
  issues: IssueListItem[];
  prefs: BoardDisplayPrefs;
}) {
  const { workspace, statuses, members, cycles } = useWorkspace();
  const { openCreateIssue } = useShortcuts();
  const searchParams = useSearchParams();
  const qc = useQueryClient();

  const [prefs, setPrefs] = useState(serverPrefs);
  const boardOpts = {
    completed: prefs.completed,
    showBacklog: prefs.showBacklog,
  };
  const initialMatchesPrefs =
    prefs.completed === serverPrefs.completed &&
    prefs.showBacklog === serverPrefs.showBacklog;
  const { data: queryIssues, isPending: boardPending } = useBoardIssues(
    boardOpts,
    initialMatchesPrefs ? initialIssues : undefined
  );
  const resolvedQueryIssues =
    queryIssues ?? (initialMatchesPrefs ? initialIssues : undefined);

  const [issues, setIssues] = useState(initialIssues);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filters, setFilters] = useState<IssueFilters>(() =>
    parseFilters(new URLSearchParams(searchParams.toString()))
  );

  function onFiltersChange(f: IssueFilters) {
    setFilters(f);
    const qs = serializeBoardFilters(f).toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
  }

  // Adopt server prefs when they change (e.g. cookie updated in another tab).
  const [prevServerPrefs, setPrevServerPrefs] = useState(serverPrefs);
  if (prevServerPrefs !== serverPrefs) {
    setPrevServerPrefs(serverPrefs);
    setPrefs(serverPrefs);
  }

  // Ignore query updates briefly after an optimistic move so a slow
  // refetch can't yank the card back to its old column.
  const suppressServerSyncUntil = useRef(0);
  const lastQueryKey = useRef(orderKey(initialIssues));

  useEffect(() => {
    if (activeId || !resolvedQueryIssues) return;
    if (Date.now() < suppressServerSyncUntil.current) return;

    const key = orderKey(resolvedQueryIssues);
    if (key === lastQueryKey.current && key === orderKey(issues)) return;
    lastQueryKey.current = key;
    setIssues(resolvedQueryIssues);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync from query cache only
  }, [resolvedQueryIssues, activeId]);

  // Mouse drags start after a small movement; touch drags need a long-press
  // so cards don't hijack scrolling on phones.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    })
  );

  const visible = useMemo(
    () => applyFilters(issues, filters, cycles),
    [issues, filters, cycles]
  );

  // Prefill create-issue with the board's cycle when the view is scoped to one.
  const defaultCycleId = useMemo(
    () => defaultCycleIdFromFilters(filters, cycles),
    [filters, cycles]
  );

  const boardColumns = useMemo((): BoardColumnDef[] => {
    switch (prefs.columns) {
      case "assignee":
        return [
          ...members.map((m) => ({
            key: m.id,
            title: m.name,
            icon: <UserAvatar user={m} className="size-4.5" />,
          })),
          {
            key: "none",
            title: "No assignee",
            icon: <CircleDashedIcon className="size-4 text-muted-foreground" />,
          },
        ];
      case "priority":
        return [1, 2, 3, 4, 0].map((value) => ({
          key: String(value),
          title: PRIORITIES.find((p) => p.value === value)!.label,
          icon: <PriorityIcon priority={value} />,
        }));
      case "cycle":
        return [
          ...cycles.map((c) => ({
            key: c.id,
            title: c.name,
            icon: <CircleDashedIcon className="size-4 text-muted-foreground" />,
          })),
          {
            key: "none",
            title: "No cycle",
            icon: <CircleDashedIcon className="size-4 text-muted-foreground" />,
          },
        ];
      default:
        return statuses
          .filter((s) => prefs.showBacklog || s.type !== "backlog")
          .map((s) => ({
            key: s.id,
            title: s.name,
            icon: <StatusIcon status={s} />,
            statusId: s.id,
            isCompleted: s.type === "done" || s.type === "canceled",
          }));
    }
  }, [prefs.columns, prefs.showBacklog, statuses, members, cycles]);

  const byGroup = useMemo(() => {
    const map = new Map<string, IssueListItem[]>();
    for (const c of boardColumns) map.set(c.key, []);
    for (const i of visible) {
      map.get(groupKeyOf(i, prefs.columns))?.push(i);
    }
    const compare = orderingComparator(prefs.ordering);
    for (const c of boardColumns) {
      const list = map.get(c.key)!;
      list.sort(
        c.isCompleted && prefs.orderCompletedByRecency
          ? recencyComparator
          : compare
      );
    }
    return map;
  }, [visible, boardColumns, prefs.columns, prefs.ordering, prefs.orderCompletedByRecency]);

  const [columns, setColumns] = useState<Record<string, string[]>>(() => {
    const next: Record<string, string[]> = {};
    for (const c of boardColumns) {
      next[c.key] = initialIssues
        .filter((i) => groupKeyOf(i, prefs.columns) === c.key)
        .sort((a, b) => a.boardOrder - b.boardOrder)
        .map((i) => i.id);
    }
    return next;
  });

  const lastOverId = useRef<UniqueIdentifier | null>(null);

  useEffect(() => {
    if (activeId) return;
    const next: Record<string, string[]> = {};
    for (const c of boardColumns) {
      next[c.key] = (byGroup.get(c.key) ?? []).map((i) => i.id);
    }
    setColumns(next);
  }, [byGroup, boardColumns, activeId]);

  const issueMap = useMemo(() => {
    const m = new Map<string, IssueListItem>();
    for (const i of issues) m.set(i.id, i);
    return m;
  }, [issues]);

  const activeIssue = activeId ? issueMap.get(activeId) ?? null : null;

  function findContainer(id: string): string | undefined {
    if (id.startsWith("col-")) return id.slice(4);
    return Object.keys(columns).find((key) => columns[key]?.includes(id));
  }

  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      const active = args.active.id;
      const pointerHits = pointerWithin(args).filter((c) => c.id !== active);
      const rectHits = rectIntersection(args).filter((c) => c.id !== active);
      const hits = pointerHits.length > 0 ? pointerHits : rectHits;

      let overId = getFirstCollision(hits, "id");

      if (overId != null) {
        if (String(overId).startsWith("col-")) {
          const statusId = String(overId).slice(4);
          const cardIds = columns[statusId] ?? [];
          if (cardIds.length > 0) {
            const closest = closestCorners({
              ...args,
              droppableContainers: args.droppableContainers.filter(
                (c) => c.id !== active && cardIds.includes(String(c.id))
              ),
            });
            if (closest[0]) overId = closest[0].id;
          }
        }
        lastOverId.current = overId;
        return [{ id: overId }];
      }

      if (lastOverId.current && lastOverId.current !== active) {
        return [{ id: lastOverId.current }];
      }

      return closestCorners({
        ...args,
        droppableContainers: args.droppableContainers.filter(
          (c) => c.id !== active
        ),
      });
    },
    [columns]
  );

  function onDragStart(e: DragStartEvent) {
    lastOverId.current = null;
    setActiveId(String(e.active.id));
  }

  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;

    const activeIssueId = String(active.id);
    const overId = String(over.id);
    if (overId === activeIssueId) return;

    const activeContainer = findContainer(activeIssueId);
    const overContainer = findContainer(overId);
    if (!activeContainer || !overContainer) return;
    if (activeContainer === overContainer) return;

    lastOverId.current = over.id;

    setColumns((prev) => {
      const activeItems = prev[activeContainer] ?? [];
      const overItems = prev[overContainer] ?? [];
      const activeIndex = activeItems.indexOf(activeIssueId);
      if (activeIndex === -1) return prev;

      let newIndex: number;
      if (overId.startsWith("col-")) {
        newIndex = overItems.length;
      } else {
        const overIndex = overItems.indexOf(overId);
        newIndex = overIndex >= 0 ? overIndex : overItems.length;
      }

      return {
        ...prev,
        [activeContainer]: activeItems.filter((id) => id !== activeIssueId),
        [overContainer]: [
          ...overItems.slice(0, newIndex),
          activeIssueId,
          ...overItems.slice(newIndex),
        ],
      };
    });

    setIssues((prev) =>
      prev.map((i) =>
        i.id === activeIssueId
          ? applyGroupToIssue(i, prefs.columns, overContainer, statuses)
          : i
      )
    );
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    const issueId = String(active.id);

    const resolvedOverId = String(
      (over && over.id !== active.id ? over.id : null) ??
        lastOverId.current ??
        over?.id ??
        ""
    );

    if (!resolvedOverId) {
      setActiveId(null);
      lastOverId.current = null;
      return;
    }

    const overId = resolvedOverId;
    const activeContainer = findContainer(issueId);
    const overContainer = findContainer(overId) ?? activeContainer;
    if (!activeContainer || !overContainer) {
      setActiveId(null);
      lastOverId.current = null;
      return;
    }

    let nextColumns = columns;

    if (activeContainer === overContainer && !overId.startsWith("col-")) {
      const items = columns[activeContainer] ?? [];
      const oldIndex = items.indexOf(issueId);
      const newIndex = items.indexOf(overId);
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        nextColumns = {
          ...columns,
          [activeContainer]: arrayMove(items, oldIndex, newIndex),
        };
        setColumns(nextColumns);
      }
    }

    const orderedIds = nextColumns[overContainer] ?? [];
    const index = orderedIds.indexOf(issueId);
    const beforeId = index > 0 ? orderedIds[index - 1] : undefined;
    const afterId =
      index >= 0 && index < orderedIds.length - 1
        ? orderedIds[index + 1]
        : undefined;
    const prevOrder = beforeId
      ? (issueMap.get(beforeId)?.boardOrder ?? null)
      : null;
    const nextOrder = afterId
      ? (issueMap.get(afterId)?.boardOrder ?? null)
      : null;

    let boardOrder: number;
    if (prevOrder != null && nextOrder != null) {
      boardOrder = (prevOrder + nextOrder) / 2;
    } else if (prevOrder != null) {
      boardOrder = prevOrder + 1000;
    } else if (nextOrder != null) {
      boardOrder = nextOrder - 1000;
    } else {
      boardOrder = Date.now();
    }

    setIssues((prevIssues) => {
      const next = prevIssues.map((i) =>
        i.id === issueId
          ? {
              ...applyGroupToIssue(i, prefs.columns, overContainer, statuses),
              boardOrder,
            }
          : i
      );
      qc.setQueryData(queryKeys.issues.board(workspace.id, boardOpts), next);
      qc.setQueryData(
        queryKeys.issues.list(workspace.id),
        (old: IssueListItem[] | undefined) => {
          if (!old) return old;
          const byId = new Map(next.map((i) => [i.id, i]));
          return old.map((i) => byId.get(i.id) ?? i);
        }
      );
      return next;
    });

    suppressServerSyncUntil.current = Date.now() + 4000;
    setActiveId(null);
    lastOverId.current = null;

    if (prefs.columns === "status") {
      void moveIssueOnBoard(issueId, overContainer, boardOrder);
    } else {
      void moveIssueOnBoardGrouped(
        issueId,
        moveTargetFor(prefs.columns, overContainer),
        boardOrder
      );
    }
  }

  function issuesForColumn(columnKey: string): IssueListItem[] {
    const ids = columns[columnKey] ?? [];
    return ids
      .map((id) => {
        const issue = issueMap.get(id);
        if (!issue) return null;
        return groupKeyOf(issue, prefs.columns) === columnKey
          ? issue
          : applyGroupToIssue(issue, prefs.columns, columnKey, statuses);
      })
      .filter((i): i is IssueListItem => !!i);
  }

  if (boardPending && !resolvedQueryIssues) {
    return <BoardSkeleton />;
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-4 py-1.5">
        <MobileNavButton />
        <h1 className="text-sm font-semibold">Board</h1>
        <span className="text-xs text-muted-foreground">{visible.length}</span>
        <FiltersBar filters={filters} onChange={onFiltersChange} />
        <div className="ml-auto flex items-center gap-2">
          <BoardDisplayMenu prefs={prefs} onChange={setPrefs} />
          <Button
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => openCreateIssue({ cycleId: defaultCycleId })}
          >
            <PlusIcon className="size-3.5" />
            New issue
          </Button>
        </div>
      </header>
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <DndContext
          id="board-dnd"
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setActiveId(null);
            lastOverId.current = null;
          }}
        >
          <div className="flex h-full gap-3 overflow-y-auto p-3">
            {boardColumns
              .filter((c) => {
                if (prefs.showEmptyColumns || activeId) return true;
                return issuesForColumn(c.key).length > 0;
              })
              .map((c) => (
                <Column
                  key={c.key}
                  column={c}
                  issues={issuesForColumn(c.key)}
                  dragging={!!activeId}
                  onNewIssue={() =>
                    openCreateIssue({
                      statusId: c.statusId,
                      // When columns are grouped by cycle, prefer the column;
                      // otherwise use the board's active cycle filter.
                      cycleId:
                        prefs.columns === "cycle"
                          ? c.key === "none"
                            ? null
                            : c.key
                          : defaultCycleId,
                    })
                  }
                  properties={prefs.properties}
                  onIssuePatch={(issueId, patch) => {
                    const current = issueMap.get(issueId);
                    if (!current) return;
                    // Local board state only — React Query is updated by
                    // optimisticUpdateIssue so rollback snapshots stay correct.
                    const resolved = resolveIssuePatch(
                      patch,
                      current.statusId,
                      statuses
                    );
                    suppressServerSyncUntil.current = Date.now() + 4000;
                    setIssues((prev) =>
                      prev.map((i) =>
                        i.id === issueId
                          ? applyPatchToListItem(i, resolved)
                          : i
                      )
                    );
                  }}
                  onIssueDelete={(issueId) => {
                    suppressServerSyncUntil.current = Date.now() + 4000;
                    setIssues((prev) => prev.filter((i) => i.id !== issueId));
                  }}
                />
              ))}
          </div>
          <DragOverlay dropAnimation={dropAnimation}>
            {activeIssue ? (
              <BoardCardContent
                issue={activeIssue}
                properties={prefs.properties}
                className="drag-overlay-card cursor-grabbing"
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
