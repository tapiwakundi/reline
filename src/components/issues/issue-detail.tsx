"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronRightIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  addComment,
  attachToIssue,
  deleteAttachment,
  deleteIssue,
  updateIssue,
  type AttachmentInput,
} from "@/lib/actions/issues";
import { useWorkspace } from "@/lib/workspace-context";
import { useIssueDetail } from "@/lib/hooks/queries";
import { invalidateAfterIssueChange } from "@/lib/invalidate";
import type {
  ActivityItem,
  IssueDetailData,
  Member,
} from "@/lib/types";
import {
  AssigneePicker,
  CyclePicker,
  LabelPicker,
  PriorityPicker,
  StatusPicker,
} from "@/components/pickers";
import { UserAvatar } from "@/components/user-avatar";
import { CommentBody } from "@/components/comment-body";
import { CommentComposer } from "@/components/comment-composer";
import { AttachButton } from "@/components/attachments/attach-button";
import { AttachmentThumbnails } from "@/components/attachments/attachment-thumbnails";
import { mediaFiles, useAttachmentUploads } from "@/lib/upload";

function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function activityText(a: ActivityItem, members: Member[]) {
  switch (a.type) {
    case "created":
      return "created the issue";
    case "status_changed":
      return a.data.from
        ? `changed status from ${a.data.from} to ${a.data.to}`
        : `moved to ${a.data.to}`;
    case "assigned": {
      const m = members.find((x) => x.id === a.data.assigneeId);
      return `assigned to ${m?.name ?? "someone"}`;
    }
    default:
      return a.type.replace(/_/g, " ");
  }
}

export function IssueDetail({
  initialData,
}: {
  initialData: IssueDetailData;
}) {
  const key = initialData.issue.identifier;
  const { data = initialData } = useIssueDetail(key, initialData);
  const { issue, comments, activities } = data;

  const { members } = useWorkspace();
  const router = useRouter();
  const qc = useQueryClient();
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState(issue.title);
  const [description, setDescription] = useState(issue.description);
  const [syncedFrom, setSyncedFrom] = useState({
    id: issue.id,
    title: issue.title,
    description: issue.description,
  });
  if (
    syncedFrom.id !== issue.id ||
    syncedFrom.title !== issue.title ||
    syncedFrom.description !== issue.description
  ) {
    setSyncedFrom({
      id: issue.id,
      title: issue.title,
      description: issue.description,
    });
    setTitle(issue.title);
    setDescription(issue.description);
  }
  const uploads = useAttachmentUploads();
  const persisted = useRef(new Set<string>());

  async function refreshDetail() {
    await invalidateAfterIssueChange(qc);
  }

  // Persist issue-level uploads as soon as each finishes.
  useEffect(() => {
    for (const item of uploads.items) {
      if (item.status !== "done" || !item.key) continue;
      if (persisted.current.has(item.localId)) continue;
      persisted.current.add(item.localId);
      const input: AttachmentInput = {
        key: item.key,
        filename: item.filename,
        contentType: item.contentType,
        size: item.size,
      };
      const { localId } = item;
      startTransition(async () => {
        await attachToIssue(issue.id, [input]);
        uploads.remove(localId);
        await refreshDetail();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- persist each finished upload once
  }, [uploads, issue.id]);

  function patch(p: Parameters<typeof updateIssue>[1]) {
    startTransition(async () => {
      await updateIssue(issue.id, p);
      await refreshDetail();
    });
  }

  function saveText() {
    if (title !== issue.title || description !== issue.description) {
      patch({ title, description });
    }
  }

  function submitComment(body: string, attachments: AttachmentInput[]) {
    startTransition(async () => {
      await addComment(issue.id, body, attachments);
      await refreshDetail();
    });
  }

  function onDeleteAttachment(id: string) {
    startTransition(async () => {
      await deleteAttachment(id);
      await refreshDetail();
    });
  }

  function onDelete() {
    startTransition(async () => {
      await deleteIssue(issue.id);
      toast.success(`${issue.identifier} deleted`);
      await invalidateAfterIssueChange(qc);
      router.push("/issues");
    });
  }

  const feed = [
    ...activities.map((a) => ({ kind: "activity" as const, at: a.createdAt, a })),
    ...comments.map((c) => ({ kind: "comment" as const, at: c.createdAt, c })),
  ].sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-border px-4 text-[13px]">
          <Link href="/issues" className="text-muted-foreground hover:text-foreground">
            Issues
          </Link>
          <ChevronRightIcon className="size-3.5 text-muted-foreground/60" />
          <span className="font-medium">{issue.identifier}</span>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto size-7 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            disabled={pending}
            title="Delete issue"
          >
            <Trash2Icon className="size-4" />
          </Button>
        </header>

        <div className="mx-auto w-full max-w-3xl px-6 py-6">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveText}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="w-full bg-transparent text-xl font-semibold outline-none placeholder:text-muted-foreground/50"
            placeholder="Issue title"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={saveText}
            onPaste={(e) => {
              const files = mediaFiles(e.clipboardData.files);
              if (files.length) {
                e.preventDefault();
                uploads.addFiles(files);
              }
            }}
            placeholder="Add description…"
            rows={Math.max(4, description.split("\n").length + 1)}
            className="mt-3 w-full resize-none bg-transparent text-sm leading-6 text-foreground/90 outline-none placeholder:text-muted-foreground/50"
          />

          <div
            className="mt-2 flex flex-col gap-2"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const files = mediaFiles(e.dataTransfer.files);
              if (files.length) {
                e.preventDefault();
                uploads.addFiles(files);
              }
            }}
          >
            <AttachmentThumbnails
              saved={issue.attachments}
              pending={uploads.items}
              onDeleteSaved={onDeleteAttachment}
              onRemovePending={uploads.remove}
            />
            <div>
              <AttachButton onFiles={uploads.addFiles} disabled={pending} />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5 lg:hidden">
            <StatusPicker value={issue.statusId} onChange={(statusId) => patch({ statusId })} />
            <PriorityPicker value={issue.priority} onChange={(priority) => patch({ priority })} />
            <AssigneePicker value={issue.assigneeId} onChange={(assigneeId) => patch({ assigneeId })} />
            <LabelPicker value={issue.labelIds} onChange={(labelIds) => patch({ labelIds })} />
            <CyclePicker value={issue.cycleId} onChange={(cycleId) => patch({ cycleId })} />
          </div>

          <Separator className="my-6" />

          <h2 className="mb-4 text-sm font-medium">Activity</h2>
          <div className="flex flex-col gap-4">
            {feed.map((item) =>
              item.kind === "comment" ? (
                <div key={`c-${item.c.id}`} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center gap-2">
                    <UserAvatar user={item.c.author} className="size-5" />
                    <span className="text-[13px] font-medium">
                      {item.c.author?.name ?? "Unknown"}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {timeAgo(item.c.createdAt)}
                    </span>
                  </div>
                  <CommentBody body={item.c.body} members={members} />
                  <AttachmentThumbnails
                    saved={item.c.attachments}
                    onDeleteSaved={onDeleteAttachment}
                    className="mt-2"
                  />
                </div>
              ) : (
                <div key={`a-${item.a.id}`} className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                  <UserAvatar user={item.a.actor} className="size-4" />
                  <span className="font-medium text-foreground/80">
                    {item.a.actor?.name ?? "Someone"}
                  </span>
                  {activityText(item.a, members)}
                  <span className="text-muted-foreground/60">
                    · {timeAgo(item.a.createdAt)}
                  </span>
                </div>
              )
            )}
          </div>

          <CommentComposer
            members={members}
            onSubmit={submitComment}
            pending={pending}
          />
        </div>
      </div>

      <aside className="hidden w-64 shrink-0 flex-col gap-5 overflow-y-auto border-l border-border px-4 py-5 lg:flex">
        <PropertyRow label="Status">
          <StatusPicker value={issue.statusId} onChange={(statusId) => patch({ statusId })} />
        </PropertyRow>
        <PropertyRow label="Priority">
          <PriorityPicker value={issue.priority} onChange={(priority) => patch({ priority })} />
        </PropertyRow>
        <PropertyRow label="Assignee">
          <AssigneePicker value={issue.assigneeId} onChange={(assigneeId) => patch({ assigneeId })} />
        </PropertyRow>
        <PropertyRow label="Labels">
          <LabelPicker value={issue.labelIds} onChange={(labelIds) => patch({ labelIds })} />
        </PropertyRow>
        <PropertyRow label="Cycle">
          <CyclePicker value={issue.cycleId} onChange={(cycleId) => patch({ cycleId })} />
        </PropertyRow>
      </aside>
    </div>
  );
}

function PropertyRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
        {label}
      </span>
      {children}
    </div>
  );
}
