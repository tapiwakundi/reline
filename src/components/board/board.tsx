"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
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
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { moveIssueOnBoard } from "@/lib/actions/issues";
import { useWorkspace } from "@/lib/workspace-context";
import { useShortcuts } from "@/components/global-shortcuts";
import type { IssueListItem, StatusRow } from "@/lib/types";
import {
  applyFilters,
  parseFilters,
  serializeFilters,
  type IssueFilters,
} from "@/lib/filtering";
import { FiltersBar } from "@/components/filters-bar";
import { StatusIcon } from "@/components/status-icon";
import { BoardCard, BoardCardContent } from "@/components/board/board-card";

const dropAnimation: DropAnimation = {
  duration: 120,
  easing: "ease-out",
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: "0" } },
  }),
};

function Column({
  status,
  issues,
  dragging,
  onNewIssue,
}: {
  status: StatusRow;
  issues: IssueListItem[];
  dragging: boolean;
  onNewIssue: () => void;
}) {
  const { setNodeRef } = useDroppable({
    id: `col-${status.id}`,
    data: { statusId: status.id, type: "column" },
  });

  return (
    <div className="group/col flex w-[300px] shrink-0 flex-col">
      <div className="flex h-9 items-center gap-2 px-1.5">
        <StatusIcon status={status} />
        <span className="text-[13px] font-medium">{status.name}</span>
        <span className="text-xs text-muted-foreground">{issues.length}</span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-6 text-muted-foreground"
          onClick={onNewIssue}
          title={`New issue in ${status.name}`}
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
          className="flex min-h-[calc(100vh-10rem)] flex-1 flex-col gap-2 rounded-lg p-1.5"
        >
          {issues.map((issue) => (
            <BoardCard key={issue.id} issue={issue} />
          ))}
          {!dragging && (
            <button
              type="button"
              onClick={onNewIssue}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-transparent text-xs text-muted-foreground opacity-0 transition-all duration-150 group-hover/col:border-border/80 group-hover/col:opacity-100 hover:border-primary/45 hover:bg-primary/5 hover:text-foreground"
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
    .map((i) => `${i.id}:${i.statusId}:${i.boardOrder}`)
    .join("|");
}

export function Board({ issues: serverIssues }: { issues: IssueListItem[] }) {
  const { statuses } = useWorkspace();
  const { openCreateIssue } = useShortcuts();
  const searchParams = useSearchParams();

  const [issues, setIssues] = useState(serverIssues);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filters, setFilters] = useState<IssueFilters>(() =>
    parseFilters(new URLSearchParams(searchParams.toString()))
  );

  // Ignore server props briefly after an optimistic move so a slow
  // revalidation can't yank the card back to its old column.
  const suppressServerSyncUntil = useRef(0);
  const lastServerKey = useRef(orderKey(serverIssues));

  useEffect(() => {
    if (activeId) return;
    if (Date.now() < suppressServerSyncUntil.current) return;

    const key = orderKey(serverIssues);
    if (key === lastServerKey.current && key === orderKey(issues)) return;
    lastServerKey.current = key;
    setIssues(serverIssues);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync from server props only
  }, [serverIssues, activeId]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  function onFiltersChange(f: IssueFilters) {
    setFilters(f);
    const qs = serializeFilters(f).toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : location.pathname);
  }

  const visible = useMemo(
    () => applyFilters(issues, filters),
    [issues, filters]
  );

  const byStatus = useMemo(() => {
    const map = new Map<string, IssueListItem[]>();
    for (const s of statuses) map.set(s.id, []);
    for (const i of visible) map.get(i.statusId)?.push(i);
    for (const list of map.values()) {
      list.sort((a, b) => a.boardOrder - b.boardOrder);
    }
    return map;
  }, [visible, statuses]);

  const [columns, setColumns] = useState<Record<string, string[]>>(() => {
    const next: Record<string, string[]> = {};
    for (const s of statuses) {
      next[s.id] = serverIssues
        .filter((i) => i.statusId === s.id)
        .sort((a, b) => a.boardOrder - b.boardOrder)
        .map((i) => i.id);
    }
    return next;
  });

  const lastOverId = useRef<UniqueIdentifier | null>(null);

  useEffect(() => {
    if (activeId) return;
    const next: Record<string, string[]> = {};
    for (const s of statuses) {
      next[s.id] = (byStatus.get(s.id) ?? []).map((i) => i.id);
    }
    setColumns(next);
  }, [byStatus, statuses, activeId]);

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
        i.id === activeIssueId ? { ...i, statusId: overContainer } : i
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

    setIssues((prevIssues) =>
      prevIssues.map((i) =>
        i.id === issueId
          ? { ...i, statusId: overContainer, boardOrder }
          : i
      )
    );

    suppressServerSyncUntil.current = Date.now() + 4000;
    setActiveId(null);
    lastOverId.current = null;

    void moveIssueOnBoard(issueId, overContainer, boardOrder);
  }

  function issuesForColumn(statusId: string): IssueListItem[] {
    const ids = columns[statusId] ?? [];
    return ids
      .map((id) => {
        const issue = issueMap.get(id);
        if (!issue) return null;
        return issue.statusId === statusId ? issue : { ...issue, statusId };
      })
      .filter((i): i is IssueListItem => !!i);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
        <h1 className="text-sm font-semibold">Board</h1>
        <span className="text-xs text-muted-foreground">{visible.length}</span>
        <div className="ml-auto flex items-center gap-2">
          <FiltersBar filters={filters} onChange={onFiltersChange} />
          <Button
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => openCreateIssue()}
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
            {statuses.map((s) => (
              <Column
                key={s.id}
                status={s}
                issues={issuesForColumn(s.id)}
                dragging={!!activeId}
                onNewIssue={() => openCreateIssue(s.id)}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={dropAnimation}>
            {activeIssue ? (
              <BoardCardContent
                issue={activeIssue}
                className="drag-overlay-card cursor-grabbing"
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
