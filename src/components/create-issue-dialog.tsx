"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createIssue } from "@/lib/actions/issues";
import { useWorkspace } from "@/lib/workspace-context";
import {
  AssigneePicker,
  CyclePicker,
  LabelPicker,
  PriorityPicker,
  StatusPicker,
} from "@/components/pickers";
import { AttachButton } from "@/components/attachments/attach-button";
import { AttachmentThumbnails } from "@/components/attachments/attachment-thumbnails";
import { mediaFiles, useAttachmentUploads } from "@/lib/upload";

export function CreateIssueDialog({
  open,
  onOpenChange,
  defaultStatusId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultStatusId?: string;
}) {
  const { workspace, statuses } = useWorkspace();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const fallbackStatus =
    (statuses.find((s) => s.type === "unstarted") ?? statuses[0]).id;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [statusId, setStatusId] = useState(fallbackStatus);
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
    setStatusId(defaultStatusId ?? fallbackStatus);
    setPriority(0);
    setAssigneeId(null);
    setCycleId(null);
    setLabelIds([]);
    clearUploads();
  }, [open, defaultStatusId, fallbackStatus, clearUploads]);

  function submit() {
    // #region agent log
    fetch('http://127.0.0.1:7359/ingest/c6e924e4-96dd-46bf-962f-91fc58f5ca8b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'846e9b'},body:JSON.stringify({sessionId:'846e9b',runId:'pre-fix',hypothesisId:'A',location:'create-issue-dialog.tsx:submit',message:'submit called',data:{titleLen:title.trim().length,uploading:uploads.uploading,pending,itemStatuses:uploads.items.map(i=>({status:i.status,progress:i.progress,hasKey:!!i.key,error:i.error??null})),attachmentCount:uploads.toInput().length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    if (!title.trim() || uploads.uploading) {
      // #region agent log
      fetch('http://127.0.0.1:7359/ingest/c6e924e4-96dd-46bf-962f-91fc58f5ca8b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'846e9b'},body:JSON.stringify({sessionId:'846e9b',runId:'post-fix',hypothesisId:'A',location:'create-issue-dialog.tsx:early-return',message:'submit blocked',data:{reason:!title.trim()?'empty-title':'uploading'},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
      if (uploads.uploading) {
        toast.message("Wait for uploads to finish");
      }
      return;
    }
    startTransition(async () => {
      try {
        const payload = uploads.toInput();
        // #region agent log
        fetch('http://127.0.0.1:7359/ingest/c6e924e4-96dd-46bf-962f-91fc58f5ca8b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'846e9b'},body:JSON.stringify({sessionId:'846e9b',runId:'pre-fix',hypothesisId:'B',location:'create-issue-dialog.tsx:before-createIssue',message:'calling createIssue',data:{attachmentCount:payload.length,statusId,priority},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        const { identifier } = await createIssue({
          title,
          description,
          statusId,
          priority,
          assigneeId,
          cycleId,
          labelIds,
          attachments: payload,
        });
        // #region agent log
        fetch('http://127.0.0.1:7359/ingest/c6e924e4-96dd-46bf-962f-91fc58f5ca8b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'846e9b'},body:JSON.stringify({sessionId:'846e9b',runId:'pre-fix',hypothesisId:'C',location:'create-issue-dialog.tsx:success',message:'createIssue succeeded',data:{identifier},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        toast.success(`${identifier} created`);
        onOpenChange(false);
        router.refresh();
      } catch (e) {
        // #region agent log
        fetch('http://127.0.0.1:7359/ingest/c6e924e4-96dd-46bf-962f-91fc58f5ca8b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'846e9b'},body:JSON.stringify({sessionId:'846e9b',runId:'pre-fix',hypothesisId:'B',location:'create-issue-dialog.tsx:catch',message:'createIssue threw',data:{error:e instanceof Error?e.message:String(e)},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        toast.error(e instanceof Error ? e.message : "Failed to create issue");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[30%] max-w-2xl translate-y-0 gap-0 p-0"
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
          <PriorityPicker value={priority} onChange={setPriority} />
          <AssigneePicker value={assigneeId} onChange={setAssigneeId} />
          <LabelPicker value={labelIds} onChange={setLabelIds} />
          <CyclePicker value={cycleId} onChange={setCycleId} />
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
