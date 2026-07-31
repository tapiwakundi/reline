"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-context";
import type { IssueListItem } from "@/lib/types";
import { PriorityIcon } from "@/components/priority-icon";
import { UserAvatar } from "@/components/user-avatar";

export function BoardCardContent({
  issue,
  className,
}: {
  issue: IssueListItem;
  className?: string;
}) {
  const { labels, members } = useWorkspace();
  const issueLabels = labels.filter((l) => issue.labelIds.includes(l.id));
  const assignee = members.find((m) => m.id === issue.assigneeId) ?? null;

  return (
    <div
      className={cn(
        "flex cursor-pointer flex-col gap-2 rounded-lg border border-border bg-card p-3 transition-colors hover:border-muted-foreground/30",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">
          {issue.identifier}
        </span>
        {assignee ? <UserAvatar user={assignee} className="size-4.5" /> : null}
      </div>
      <p className="line-clamp-3 text-[13px] font-medium leading-snug">
        {issue.title}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <PriorityIcon priority={issue.priority} />
        {issueLabels.map((l) => (
          <span
            key={l.id}
            className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-px text-[10px] text-muted-foreground"
          >
            <span className="size-1.5 rounded-full" style={{ background: l.color }} />
            {l.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export function BoardCard({ issue }: { issue: IssueListItem }) {
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
        <BoardCardContent issue={issue} />
      )}
    </div>
  );
}
