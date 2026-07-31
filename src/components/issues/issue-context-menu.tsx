"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ReactElement } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CirclePlayIcon,
  CopyIcon,
  LinkIcon,
  SquareArrowOutUpRightIcon,
  TagIcon,
  Trash2Icon,
  UserIcon,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { deleteIssue, updateIssue } from "@/lib/actions/issues";
import { useWorkspace } from "@/lib/workspace-context";
import { invalidateAfterIssueChange } from "@/lib/invalidate";
import { PRIORITIES } from "@/lib/defaults";
import type { IssueListItem } from "@/lib/types";
import { StatusIcon } from "@/components/status-icon";
import { PriorityIcon } from "@/components/priority-icon";
import { UserAvatar } from "@/components/user-avatar";

export type IssuePatch = Parameters<typeof updateIssue>[1];

export function IssueContextMenu({
  issue,
  children,
  onOptimisticUpdate,
  onOptimisticDelete,
}: {
  issue: IssueListItem;
  children: ReactElement;
  /** Apply local state immediately (e.g. board columns) before the server refresh. */
  onOptimisticUpdate?: (patch: IssuePatch) => void;
  onOptimisticDelete?: () => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [, startTransition] = useTransition();
  const { statuses, members, labels, cycles } = useWorkspace();

  const currentStatus = statuses.find((s) => s.id === issue.statusId);

  function patch(p: IssuePatch) {
    onOptimisticUpdate?.(p);
    startTransition(async () => {
      await updateIssue(issue.id, p);
      await invalidateAfterIssueChange(qc);
    });
  }

  function openIssue() {
    router.push(`/issue/${issue.identifier}`);
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Couldn't copy ${label.toLowerCase()}`);
    }
  }

  function onDelete() {
    onOptimisticDelete?.();
    startTransition(async () => {
      await deleteIssue(issue.id);
      toast.success(`${issue.identifier} deleted`);
      await invalidateAfterIssueChange(qc);
    });
  }

  function toggleLabel(labelId: string) {
    const next = issue.labelIds.includes(labelId)
      ? issue.labelIds.filter((id) => id !== labelId)
      : [...issue.labelIds, labelId];
    patch({ labelIds: next });
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent className="w-56">
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            {currentStatus ? (
              <StatusIcon status={currentStatus} />
            ) : (
              <span className="size-3.5" />
            )}
            <span className="flex-1">Status</span>
            <span className="text-xs tracking-widest text-muted-foreground">
              S
            </span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48">
            <ContextMenuRadioGroup
              value={issue.statusId}
              onValueChange={(statusId) => patch({ statusId })}
            >
              <ContextMenuLabel>Change status…</ContextMenuLabel>
              {statuses.map((s, i) => (
                <ContextMenuRadioItem key={s.id} value={s.id}>
                  <StatusIcon status={s} />
                  {s.name}
                  {i < 9 && (
                    <ContextMenuShortcut>{i + 1}</ContextMenuShortcut>
                  )}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <PriorityIcon priority={issue.priority} />
            <span className="flex-1">Priority</span>
            <span className="text-xs tracking-widest text-muted-foreground">
              P
            </span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-44">
            <ContextMenuRadioGroup
              value={String(issue.priority)}
              onValueChange={(v) => patch({ priority: Number(v) })}
            >
              <ContextMenuLabel>Change priority…</ContextMenuLabel>
              {PRIORITIES.map((p) => (
                <ContextMenuRadioItem key={p.value} value={String(p.value)}>
                  <PriorityIcon priority={p.value} />
                  {p.label}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <UserIcon className="size-3.5 text-muted-foreground" />
            <span className="flex-1">Assignee</span>
            <span className="text-xs tracking-widest text-muted-foreground">
              A
            </span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-52">
            <ContextMenuRadioGroup
              value={issue.assigneeId ?? "none"}
              onValueChange={(v) =>
                patch({ assigneeId: v === "none" ? null : v })
              }
            >
              <ContextMenuLabel>Assign to…</ContextMenuLabel>
              <ContextMenuRadioItem value="none">
                <UserAvatar user={null} className="size-4" />
                No assignee
              </ContextMenuRadioItem>
              {members.map((m) => (
                <ContextMenuRadioItem key={m.id} value={m.id}>
                  <UserAvatar user={m} className="size-4" />
                  {m.name}
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuSubContent>
        </ContextMenuSub>

        {labels.length > 0 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <TagIcon className="size-3.5 text-muted-foreground" />
              <span className="flex-1">Labels</span>
              <span className="text-xs tracking-widest text-muted-foreground">
                L
              </span>
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-48">
              <ContextMenuGroup>
                <ContextMenuLabel>Apply labels…</ContextMenuLabel>
                {labels.map((l) => (
                  <ContextMenuCheckboxItem
                    key={l.id}
                    checked={issue.labelIds.includes(l.id)}
                    onCheckedChange={() => toggleLabel(l.id)}
                  >
                    <span
                      className="size-2.5 rounded-full"
                      style={{ background: l.color }}
                    />
                    {l.name}
                  </ContextMenuCheckboxItem>
                ))}
              </ContextMenuGroup>
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}

        {cycles.length > 0 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <CirclePlayIcon className="size-3.5 text-muted-foreground" />
              <span className="flex-1">Cycle</span>
              <span className="text-xs tracking-widest text-muted-foreground">
                ⇧C
              </span>
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="w-52">
              <ContextMenuRadioGroup
                value={issue.cycleId ?? "none"}
                onValueChange={(v) =>
                  patch({ cycleId: v === "none" ? null : v })
                }
              >
                <ContextMenuLabel>Change cycle…</ContextMenuLabel>
                <ContextMenuRadioItem value="none">
                  No cycle
                </ContextMenuRadioItem>
                {cycles.map((c) => (
                  <ContextMenuRadioItem key={c.id} value={c.id}>
                    {c.name}
                    {c.status === "active" && (
                      <span className="text-[10px] text-primary">Active</span>
                    )}
                  </ContextMenuRadioItem>
                ))}
              </ContextMenuRadioGroup>
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}

        <ContextMenuSeparator />

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <CopyIcon className="size-3.5 text-muted-foreground" />
            <span className="flex-1">Copy</span>
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-48">
            <ContextMenuItem
              onClick={() =>
                copyText(
                  `${window.location.origin}/issue/${issue.identifier}`,
                  "Link"
                )
              }
            >
              <LinkIcon className="size-3.5 text-muted-foreground" />
              Copy link
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => copyText(issue.identifier, "Issue ID")}
            >
              <CopyIcon className="size-3.5 text-muted-foreground" />
              Copy ID
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => copyText(issue.title, "Title")}
            >
              <CopyIcon className="size-3.5 text-muted-foreground" />
              Copy title
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuItem onClick={openIssue}>
          <SquareArrowOutUpRightIcon className="size-3.5 text-muted-foreground" />
          Open
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem variant="destructive" onClick={onDelete}>
          <Trash2Icon className="size-3.5" />
          Delete
          <ContextMenuShortcut>⌘⌫</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
