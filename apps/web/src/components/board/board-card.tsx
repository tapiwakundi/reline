"use client";

import { useRef, useTransition, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-context";
import { usePrefetchIssue } from "@/lib/hooks/prefetch-issue";
import { issueHrefWithCycle } from "@/components/workspace-trail";
import type { IssueListItem, LabelRow } from "@/lib/types";
import type { BoardCardProperty } from "@/lib/board-display";
import type { CycleFilter } from "@/lib/filtering";
import { PriorityIcon } from "@/components/priority-icon";
import { TypeIcon } from "@/components/issue-type-icon";
import { StatusIcon } from "@/components/status-icon";
import { UserAvatar } from "@/components/user-avatar";
import {
  AssigneePicker,
  CyclePicker,
  EpicPicker,
  LabelPicker,
  PriorityPicker,
  StatusPicker,
  TypePicker,
} from "@/components/pickers";
import {
  optimisticUpdateIssue,
  resolveIssuePatch,
} from "@/lib/optimistic-issues";
import {
  IssueContextMenu,
  type IssuePatch,
} from "@/components/issues/issue-context-menu";

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

const iconTriggerClass = "rounded-sm p-0.5 hover:bg-foreground/10";

function stopCardActivate(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

/** Keeps a click on a property from dragging the card or opening the issue. */
function CardControl({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      data-card-control=""
      className={cn("inline-flex max-w-full min-w-0", className)}
      onMouseDown={stopCardActivate}
      onPointerDown={stopCardActivate}
      onTouchStart={stopCardActivate}
      onClick={stopCardActivate}
      onKeyDown={stopCardActivate}
    >
      {children}
    </span>
  );
}

function LabelChip({ label }: { label: LabelRow }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-px text-[10px] text-muted-foreground">
      <span
        className="size-1.5 rounded-full"
        style={{ background: label.color }}
      />
      {label.name}
    </span>
  );
}

export function BoardCardContent({
  issue,
  properties,
  className,
  selected = false,
  onPatch,
}: {
  issue: IssueListItem;
  properties: BoardCardProperty[];
  className?: string;
  selected?: boolean;
  /** When set, property glyphs open their pickers instead of the issue. */
  onPatch?: (patch: IssuePatch) => void;
}) {
  const { labels, members, statuses, cycles } = useWorkspace();
  const show = (p: BoardCardProperty) => properties.includes(p);

  const issueLabels = show("labels")
    ? labels.filter((l) => issue.labelIds.includes(l.id))
    : [];
  const showAssignee = show("assignee");
  const assignee = showAssignee
    ? (members.find((m) => m.id === issue.assigneeId) ?? null)
    : null;
  const status = show("status")
    ? (statuses.find((s) => s.id === issue.statusId) ?? null)
    : null;
  const cycle =
    show("cycle") && issue.cycleId
      ? (cycles.find((c) => c.id === issue.cycleId) ?? null)
      : null;

  const showHeader = show("id") || showAssignee;
  const showFooter =
    show("type") ||
    show("priority") ||
    !!status ||
    issueLabels.length > 0 ||
    !!cycle ||
    (show("estimate") && issue.estimate != null) ||
    show("created") ||
    show("updated");

  return (
    <div
      className={cn(
        "flex shrink-0 cursor-pointer flex-col gap-2 rounded-lg border border-border bg-card p-3 transition-colors hover:border-foreground/30 hover:bg-foreground/10",
        selected &&
          "border-primary/55 bg-primary/5 ring-1 ring-primary/35 hover:border-primary/55 hover:bg-primary/10",
        className
      )}
    >
      {showHeader && (
        <div className="flex items-center justify-between gap-2">
          {show("id") ? (
            <span className="text-[11px] font-medium text-muted-foreground">
              {issue.identifier}
            </span>
          ) : (
            <span />
          )}
          {showAssignee ? (
            onPatch ? (
              <CardControl>
                <AssigneePicker
                  value={issue.assigneeId}
                  onChange={(assigneeId) => onPatch({ assigneeId })}
                  trigger={
                    <UserAvatar user={assignee} className="size-4.5" />
                  }
                  triggerLabel="Change assignee"
                  className="rounded-full hover:ring-2 hover:ring-foreground/20"
                />
              </CardControl>
            ) : (
              <UserAvatar user={assignee} className="size-4.5" />
            )
          ) : null}
        </div>
      )}
      <p className="line-clamp-3 text-[13px] font-medium leading-snug">
        {issue.title}
      </p>
      {issue.epic &&
        (onPatch ? (
          <CardControl className="flex w-full">
            <EpicPicker
              value={issue.epicId}
              excludeId={issue.id}
              onChange={(epicId) => onPatch({ epicId })}
              trigger={
                <span className="min-w-0 truncate">
                  {issue.epic.identifier} {issue.epic.title}
                </span>
              }
              triggerLabel="Change epic"
              className="w-full min-w-0 justify-start border-0 bg-transparent p-0 text-left text-[11px] font-normal text-muted-foreground hover:text-foreground"
            />
          </CardControl>
        ) : (
          <p className="truncate text-[11px] text-muted-foreground">
            {issue.epic.identifier} {issue.epic.title}
          </p>
        ))}
      {showFooter && (
        <div className="flex flex-wrap items-center gap-1.5">
          {show("type") &&
            (onPatch ? (
              <CardControl>
                <TypePicker
                  value={issue.type}
                  onChange={(type) => onPatch({ type })}
                  trigger={<TypeIcon type={issue.type} />}
                  triggerLabel="Change type"
                  className={iconTriggerClass}
                />
              </CardControl>
            ) : (
              <TypeIcon type={issue.type} />
            ))}
          {show("priority") &&
            (onPatch ? (
              <CardControl>
                <PriorityPicker
                  value={issue.priority}
                  onChange={(priority) => onPatch({ priority })}
                  trigger={<PriorityIcon priority={issue.priority} />}
                  triggerLabel="Change priority"
                  className={iconTriggerClass}
                />
              </CardControl>
            ) : (
              <PriorityIcon priority={issue.priority} />
            ))}
          {status &&
            (onPatch ? (
              <CardControl>
                <StatusPicker
                  value={issue.statusId}
                  onChange={(statusId) => onPatch({ statusId })}
                  trigger={<StatusIcon status={status} />}
                  triggerLabel="Change status"
                  className={iconTriggerClass}
                />
              </CardControl>
            ) : (
              <StatusIcon status={status} />
            ))}
          {issueLabels.length > 0 &&
            (onPatch ? (
              <CardControl>
                <LabelPicker
                  value={issue.labelIds}
                  onChange={(labelIds) => onPatch({ labelIds })}
                  trigger={issueLabels.map((label) => (
                    <LabelChip key={label.id} label={label} />
                  ))}
                  triggerLabel="Change labels"
                  className="max-w-full flex-wrap gap-1"
                />
              </CardControl>
            ) : (
              issueLabels.map((label) => (
                <LabelChip key={label.id} label={label} />
              ))
            ))}
          {cycle &&
            (onPatch ? (
              <CardControl>
                <CyclePicker
                  value={issue.cycleId}
                  onChange={(cycleId) => onPatch({ cycleId })}
                  trigger={cycle.name}
                  triggerLabel="Change cycle"
                  className="h-auto rounded-full border border-border bg-transparent px-1.5 py-px text-[10px] font-normal text-muted-foreground shadow-none hover:bg-foreground/10"
                />
              </CardControl>
            ) : (
              <span className="inline-flex items-center rounded-full border border-border px-1.5 py-px text-[10px] text-muted-foreground">
                {cycle.name}
              </span>
            ))}
          {show("estimate") && issue.estimate != null && (
            <span className="inline-flex items-center rounded border border-border px-1 text-[10px] text-muted-foreground">
              {issue.estimate}
            </span>
          )}
          {show("created") && (
            <span
              className="text-[10px] text-muted-foreground"
              title={`Created ${shortDate(issue.createdAt)}`}
            >
              {shortDate(issue.createdAt)}
            </span>
          )}
          {show("updated") && (
            <span
              className="text-[10px] text-muted-foreground"
              title={`Updated ${shortDate(issue.updatedAt)}`}
            >
              {shortDate(issue.updatedAt)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Card-sized drop slot. `marker` tags the cross-column preview measured while dragging. */
export function BoardDropSlot({ marker = false }: { marker?: boolean }) {
  return (
    <div
      aria-hidden
      {...(marker ? { "data-drop-placeholder": "" } : {})}
      className="pointer-events-none min-h-[72px] w-full shrink-0 rounded-lg border border-dashed border-primary/45 bg-primary/10"
    />
  );
}

export function BoardCard({
  issue,
  properties,
  cycleIds,
  cycleEntry,
  selected = false,
  isDragPlaceholder = false,
  onSelectClick,
  onOptimisticUpdate,
  onOptimisticDelete,
  onSelectionPatch,
}: {
  issue: IssueListItem;
  properties: BoardCardProperty[];
  /** Board cycle filter — preserved in the issue URL for trail crumbs. */
  cycleIds: CycleFilter[];
  /** When the board is scoped to one sprint, status changes join that sprint. */
  cycleEntry?: { cycleId: string; joinOnAnyStatus: boolean };
  selected?: boolean;
  /** True while this card is part of an active multi-drag block. */
  isDragPlaceholder?: boolean;
  onSelectClick?: (issueId: string, event: MouseEvent) => void;
  onOptimisticUpdate?: (patch: IssuePatch) => void;
  onOptimisticDelete?: () => void;
  /** Apply this edit to every selected card. Return true when it did. */
  onSelectionPatch?: (patch: IssuePatch) => boolean;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const { workspace, statuses, cycles } = useWorkspace();
  const prefetchIssue = usePrefetchIssue();
  const [, startTransition] = useTransition();
  const dragged = useRef(false);
  const href = issueHrefWithCycle(workspace.slug, issue.identifier, cycleIds);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: issue.id,
    data: { statusId: issue.statusId },
    animateLayoutChanges: () => false,
  });

  if (isDragging) dragged.current = true;
  const showPlaceholder = isDragging || isDragPlaceholder;

  function patch(next: IssuePatch) {
    if (onSelectionPatch?.(next)) return;
    const resolved = resolveIssuePatch(
      next,
      issue,
      statuses,
      cycles,
      cycleEntry
    );
    onOptimisticUpdate?.(resolved);
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
        resolved,
        statuses,
        cycles
      );
    });
  }

  return (
    <IssueContextMenu
      issue={issue}
      href={href}
      cycleEntry={cycleEntry}
      onOptimisticUpdate={onOptimisticUpdate}
      onOptimisticDelete={onOptimisticDelete}
      onSelectionPatch={onSelectionPatch}
    >
      <div
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          // Disable transition while dragging so the ghost doesn't lag behind
          transition: isDragging ? undefined : transition,
        }}
        {...attributes}
        {...listeners}
        role="group"
        data-board-card-id={issue.id}
        onPointerEnter={() => prefetchIssue(issue.identifier, href)}
        onClick={(e) => {
          // Ignore the click that fires right after a drag release
          if (dragged.current) {
            dragged.current = false;
            return;
          }
          if (
            e.target instanceof Element &&
            e.target.closest("[data-card-control]")
          ) {
            return;
          }
          if (e.metaKey || e.ctrlKey || e.shiftKey) {
            e.preventDefault();
            onSelectClick?.(issue.id, e);
            return;
          }
          router.push(href);
        }}
        className={cn(
          "touch-manipulation",
          isDragging && "pointer-events-none"
        )}
      >
        {showPlaceholder ? (
          <BoardDropSlot />
        ) : (
          <BoardCardContent
            issue={issue}
            properties={properties}
            selected={selected}
            onPatch={patch}
          />
        )}
      </div>
    </IssueContextMenu>
  );
}
