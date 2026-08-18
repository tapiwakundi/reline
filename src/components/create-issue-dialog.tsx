"use client";

import { useEffect, useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createIssue } from "@/lib/actions/issues";
import { useWorkspace } from "@/lib/workspace-context";
import { invalidateAfterIssueChange } from "@/lib/invalidate";
import {
  AssigneePicker,
  CyclePicker,
  LabelPicker,
  PriorityPicker,
  StatusPicker,
  TypePicker,
} from "@/components/pickers";
import { AttachButton } from "@/components/attachments/attach-button";
import { AttachmentThumbnails } from "@/components/attachments/attachment-thumbnails";
import { showIssueCreatedToast } from "@/components/issue-created-toast";
import { mediaFiles, useAttachmentUploads } from "@/lib/upload";
import { todoStatusIdForCycleEntry } from "@/lib/issue-cycle";
import { wsPath } from "@/lib/workspace-paths";
import type { IssueType } from "@/lib/types";

export function CreateIssueDialog({
  open,
  onOpenChange,
  defaultStatusId,
  defaultCycleId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultStatusId?: string;
  /** When set (including `null` for "no cycle"), prefill the cycle picker. */
  defaultCycleId?: string | null;
}) {
  const { workspace, statuses } = useWorkspace();
  const qc = useQueryClient();
  const [pending, startTransition] = useTransition();

  const backlogStatusId = statuses.find((s) => s.type === "backlog")?.id;
  const fallbackStatus =
    backlogStatusId ??
    (statuses.find((s) => s.type === "unstarted") ?? statuses[0]).id;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [statusId, setStatusId] = useState(fallbackStatus);
  const [type, setType] = useState<IssueType>("story");
  const [priority, setPriority] = useState(0);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [cycleId, setCycleId] = useState<string | null>(null);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const uploads = useAttachmentUploads();
  const { clear: clearUploads } = uploads;

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDescription("");
    const initialCycleId = defaultCycleId ?? null;
    const initialStatusId = defaultStatusId ?? fallbackStatus;
    setStatusId(
      todoStatusIdForCycleEntry(statuses, initialStatusId, initialCycleId) ??
        initialStatusId
    );
    setType("story");
    setPriority(0);
    setAssigneeId(null);
    setCycleId(initialCycleId);
    setLabelIds([]);
    clearUploads();
  }, [
    open,
    defaultStatusId,
    defaultCycleId,
    fallbackStatus,
    statuses,
    clearUploads,
  ]);

  function submit() {
    if (!title.trim() || uploads.uploading) {
      if (uploads.uploading) {
        toast.message("Wait for uploads to finish");
      }
      return;
    }
    const createdTitle = title.trim();
    const createdStatusId = statusId;
    startTransition(async () => {
      try {
        const payload = uploads.toInput();
        const { identifier } = await createIssue({
          title: createdTitle,
          description,
          statusId: createdStatusId,
          type,
          priority,
          assigneeId,
          cycleId,
          labelIds,
          attachments: payload,
        });
        onOpenChange(false);
        const status =
          statuses.find((s) => s.id === createdStatusId) ?? statuses[0];
        showIssueCreatedToast({
          identifier,
          title: createdTitle,
          status: status ?? { type: "unstarted", color: "currentColor" },
          href: wsPath(workspace.slug, `/issue/${identifier}`),
        });
        void invalidateAfterIssueChange(qc, workspace.id);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to create issue");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[15%] max-w-[calc(100%-2rem)] translate-y-0 gap-0 p-0 sm:top-[30%] sm:max-w-2xl"
        showCloseButton={false}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          const files = mediaFiles(e.dataTransfer.files);
          if (files.length) {
            e.preventDefault();
            uploads.addFiles(files);
          }
        }}
      >
        <DialogTitle className="sr-only">New issue</DialogTitle>
        <div className="flex items-center gap-2 px-4 pt-3 text-xs text-muted-foreground">
          <span className="rounded border border-border px-1.5 py-0.5 font-medium">
            {workspace.prefix}
          </span>
          <span>New issue</span>
        </div>
        <div className="px-4 pt-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
            placeholder="Issue title"
            autoFocus
            className="w-full bg-transparent text-lg font-medium outline-none placeholder:text-muted-foreground/60"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
            onPaste={(e) => {
              const files = mediaFiles(e.clipboardData.files);
              if (files.length) {
                e.preventDefault();
                uploads.addFiles(files);
              }
            }}
            placeholder="Add description…"
            rows={4}
            className="mt-2 w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          />
          <AttachmentThumbnails
            pending={uploads.items}
            onRemovePending={uploads.remove}
            className="mb-1 mt-2"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3">
          <StatusPicker value={statusId} onChange={setStatusId} />
          <TypePicker value={type} onChange={setType} />
          <PriorityPicker value={priority} onChange={setPriority} />
          <AssigneePicker value={assigneeId} onChange={setAssigneeId} />
          <LabelPicker value={labelIds} onChange={setLabelIds} />
          <CyclePicker
            value={cycleId}
            onChange={(next) => {
              setCycleId(next);
              const promoted = todoStatusIdForCycleEntry(
                statuses,
                statusId,
                next
              );
              if (promoted) setStatusId(promoted);
            }}
          />
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-2.5">
          <AttachButton onFiles={uploads.addFiles} disabled={pending} />
          <span className="mr-auto text-[11px] text-muted-foreground">
            ⌘↵ to create
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => submit()}
            disabled={pending || !title.trim() || uploads.uploading}
          >
            Create issue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
