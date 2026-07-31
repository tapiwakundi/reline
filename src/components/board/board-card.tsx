"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-context";
import type { IssueListItem } from "@/lib/types";
import type { BoardCardProperty } from "@/lib/board-display";
import { PriorityIcon } from "@/components/priority-icon";
import { StatusIcon } from "@/components/status-icon";
import { UserAvatar } from "@/components/user-avatar";

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function BoardCardContent({
  issue,
  properties,
  className,
}: {
  issue: IssueListItem;
  properties: BoardCardProperty[];
  className?: string;
}) {
  const { labels, members, statuses } = useWorkspace();
  const show = (p: BoardCardProperty) => properties.includes(p);

  const issueLabels = show("labels")
    ? labels.filter((l) => issue.labelIds.includes(l.id))
    : [];
  const assignee = show("assignee")
    ? (members.find((m) => m.id === issue.assigneeId) ?? null)
    : null;
  const status = show("status")
    ? (statuses.find((s) => s.id === issue.statusId) ?? null)
    : null;

  const showHeader = show("id") || !!assignee;
  const showFooter =
    show("priority") ||
    !!status ||
    issueLabels.length > 0 ||
    (show("estimate") && issue.estimate != null) ||
    show("created") ||
    show("updated");

  return (
    <div
      className={cn(
        "flex cursor-pointer flex-col gap-2 rounded-lg border border-border bg-card p-3 transition-colors hover:border-muted-foreground/30",
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
          {assignee ? (
            <UserAvatar user={assignee} className="size-4.5" />
          ) : null}
        </div>
      )}
      <p className="line-clamp-3 text-[13px] font-medium leading-snug">
        {issue.title}
      </p>
      {showFooter && (
        <div className="flex flex-wrap items-center gap-1.5">
          {show("priority") && <PriorityIcon priority={issue.priority} />}
          {status && <StatusIcon status={status} />}
          {issueLabels.map((l) => (
            <span
              key={l.id}
              className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-px text-[10px] text-muted-foreground"
            >
              <span
                className="size-1.5 rounded-full"
                style={{ background: l.color }}
              />
              {l.name}
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

export function BoardCard({
  issue,
  properties,
}: {
  issue: IssueListItem;
  properties: BoardCardProperty[];
}) {
  const router = useRouter();
  const dragged = useRef(false);
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

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        // Disable transition while dragging so the ghost doesn't lag behind
        transition: isDragging ? undefined : transition,
      }}
      {...attributes}
      {...listeners}
      onClick={() => {
        // Ignore the click that fires right after a drag release
        if (dragged.current) {
          dragged.current = false;
          return;
        }
        router.push(`/issue/${issue.identifier}`);
      }}
      className={cn(isDragging && "pointer-events-none")}
    >
      {isDragging ? (
        // Card-sized drop slot (not a full-column highlight)
        <div
          aria-hidden
          className="min-h-[72px] rounded-lg border border-dashed border-primary/45 bg-primary/10"
        />
      ) : (
        <BoardCardContent issue={issue} properties={properties} />
      )}
    </div>
  );
}
