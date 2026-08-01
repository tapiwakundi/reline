"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRightIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { attachToIssue, type AttachmentInput } from "@/lib/actions/issues";
import { useWorkspace } from "@/lib/workspace-context";
import { useIssueDetail } from "@/lib/hooks/queries";
import { invalidateAfterIssueChange } from "@/lib/invalidate";
import {
  optimisticAddComment,
  optimisticDeleteAttachment,
  optimisticDeleteIssue,
  optimisticUpdateIssue,
  type IssuePatch,
} from "@/lib/optimistic-issues";
import type {
  ActivityItem,
  CommentItem,
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
import { IssueDetailSkeleton } from "@/components/skeletons/page-skeletons";
import { MobileNavButton } from "@/components/mobile-nav";
import { cn } from "@/lib/utils";

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
  const { data, isPending } = useIssueDetail(key, initialData);
  const detail = data ?? initialData;
  const { issue, comments, activities } = detail;
  const { members, labels, statuses, me } = useWorkspace();
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

  // Auto-grow the title textarea so long titles wrap instead of clipping.
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);

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

  function patch(p: IssuePatch) {
    startTransition(async () => {
      await optimisticUpdateIssue(
        qc,
        {
          id: issue.id,
          identifier: issue.identifier,
          statusId: issue.statusId,
        },
        p,
        statuses
      );
    });
  }

  function saveText() {
    if (title !== issue.title || description !== issue.description) {
      patch({ title, description });
    }
  }

  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  function submitComment(
    body: string,
    attachments: AttachmentInput[],
    parentId?: string
  ) {
    setReplyingTo(null);
    startTransition(async () => {
      await optimisticAddComment(
        qc,
        { id: issue.id, identifier: issue.identifier },
        body,
        me,
        attachments,
        parentId ?? null
      );
    });
  }

  function onDeleteAttachment(id: string) {
    startTransition(async () => {
      await optimisticDeleteAttachment(
        qc,
        { identifier: issue.identifier },
        id
      );
    });
  }

  function onDelete() {
    startTransition(async () => {
      await optimisticDeleteIssue(qc, {
        id: issue.id,
        identifier: issue.identifier,
      });
      router.push("/issues");
    });
  }

  // Replies render nested under their root comment; only top-level comments
  // appear in the chronological feed.
  const repliesByParent = new Map<string, CommentItem[]>();
  for (const c of comments) {
    if (!c.parentId) continue;
    const list = repliesByParent.get(c.parentId) ?? [];
    list.push(c);
    repliesByParent.set(c.parentId, list);
  }

  const feed = [
    ...activities.map((a) => ({ kind: "activity" as const, at: a.createdAt, a })),
    ...comments
      .filter((c) => !c.parentId)
      .map((c) => ({ kind: "comment" as const, at: c.createdAt, c })),
  ].sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());

  if (isPending && !data) {
    return <IssueDetailSkeleton />;
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-border px-4 text-[13px]">
          <MobileNavButton />
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

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex w-full max-w-5xl items-start md:pl-24">
          <div className="w-full min-w-0 max-w-3xl flex-1 px-4 py-6 md:px-8">
          <textarea
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
            onBlur={saveText}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLTextAreaElement).blur();
              }
            }}
            rows={1}
            className="w-full resize-none overflow-hidden bg-transparent text-xl font-semibold leading-snug outline-none placeholder:text-muted-foreground/50"
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
            <ReporterRow creator={issue.creator} />
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

                  {(repliesByParent.get(item.c.id) ?? []).map((reply) => (
                    <div
                      key={reply.id}
                      className="mt-3 border-l-2 border-border/70 pl-3"
                    >
                      <div className="flex items-center gap-2">
                        <UserAvatar user={reply.author} className="size-4.5" />
                        <span className="text-[13px] font-medium">
                          {reply.author?.name ?? "Unknown"}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {timeAgo(reply.createdAt)}
                        </span>
                      </div>
                      <CommentBody body={reply.body} members={members} />
                      <AttachmentThumbnails
                        saved={reply.attachments}
                        onDeleteSaved={onDeleteAttachment}
                        className="mt-2"
                      />
                    </div>
                  ))}

                  {replyingTo === item.c.id ? (
                    <CommentComposer
                      members={members}
                      pending={pending}
                      autoFocus
                      placeholder="Write a reply…"
                      submitLabel="Reply"
                      onCancel={() => setReplyingTo(null)}
                      onSubmit={(body, attachments) =>
                        submitComment(body, attachments, item.c.id)
                      }
                      className="mt-3"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setReplyingTo(item.c.id)}
                      className="mt-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                      Reply
                    </button>
                  )}
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

          <aside className="sticky top-0 hidden w-64 shrink-0 flex-col gap-6 px-5 py-6 lg:flex">
        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">
            Properties
          </div>
          <div className="-ml-2 flex flex-col items-start gap-0.5">
            <StatusPicker
              value={issue.statusId}
              onChange={(statusId) => patch({ statusId })}
              className={railPickerClass}
            />
            <PriorityPicker
              value={issue.priority}
              onChange={(priority) => patch({ priority })}
              className={railPickerClass}
            />
            <AssigneePicker
              value={issue.assigneeId}
              onChange={(assigneeId) => patch({ assigneeId })}
              className={railPickerClass}
            />
            <ReporterRow creator={issue.creator} className={railPickerClass} />
            <CyclePicker
              value={issue.cycleId}
              onChange={(cycleId) => patch({ cycleId })}
              placeholder="Add to cycle"
              className={railPickerClass}
            />
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">
            Labels
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {labels
              .filter((l) => issue.labelIds.includes(l.id))
              .map((l) => (
                <span
                  key={l.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs text-foreground/90"
                >
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: l.color }}
                  />
                  {l.name}
                </span>
              ))}
            <LabelPicker
              value={issue.labelIds}
              onChange={(labelIds) => patch({ labelIds })}
              plusOnly
              className="size-6 justify-center rounded-full border-transparent p-0 text-muted-foreground"
            />
          </div>
        </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

/** Borderless ghost rows for the right-hand properties rail. */
const railPickerClass =
  "border-transparent text-[13px] font-normal hover:border-transparent";

function ReporterRow({
  creator,
  className,
}: {
  creator: Member | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-xs font-medium text-foreground/90",
        className
      )}
    >
      <UserAvatar user={creator} className="size-4" />
      <span className="text-muted-foreground">Reporter</span>
      <span>{creator ? creator.name : "Unknown"}</span>
    </div>
  );
}
